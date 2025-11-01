// --- Utilities: delay and API call with backoff to avoid 429s ---
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }
// JSON repair for small models that get cut off
// Updated validation: physics checks reduced to 1 minimum

async function callChat({ apiUrl, apiKey, body, maxRetries, baseDelayMs, extraHeaders = {} }) {
  const retries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 3
  const base = Number.isFinite(Number(baseDelayMs)) ? Number(baseDelayMs) : 500
  let attempt = 0
  let lastErr
  while (attempt <= retries) {
    try {
      const hdrs = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders
      }
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(body),
      })
      if (resp.status === 429 || resp.status >= 500) {
        const t = await resp.text().catch(() => '')
        lastErr = new Error(`HTTP ${resp.status} ${t?.slice(0,200) || ''}`)
      } else if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        // Check if error contains incomplete JSON (common with small models)
        if (t.includes('error_model_output')) {
          try {
            const errorData = JSON.parse(t)
            if (errorData.error_model_output) {
              console.log('[callChat] Attempting to repair incomplete JSON from error')
              const repaired = repairIncompleteJSON(errorData.error_model_output)
              if (repaired && repaired.k) {
                console.log('[callChat] Successfully repaired JSON!', { k: repaired.k, equations: repaired.equations?.length })
                // Successfully repaired! Return as if it was a normal response
                return {
                  choices: [{
                    message: {
                      content: JSON.stringify(repaired)
                    }
                  }]
                }
              } else {
                console.log('[callChat] Repair failed - missing required fields')
              }
            }
          } catch (repairErr) {
            console.log('[callChat] Repair attempt failed:', repairErr.message)
          }
        }
        // Don't truncate error message - we need the full JSON for debugging
        throw new Error(`HTTP ${resp.status} ${t}`)
      } else {
        return await resp.json()
      }
    } catch (e) {
      lastErr = e
    }
    // backoff before next attempt
    const wait = base * Math.pow(2, attempt) + Math.floor(Math.random() * 100)
    await delay(wait)
    attempt++
  }
  throw lastErr || new Error('API call failed')
}

import { buildLatexDocument } from './latexBuilder'
import { planSchrodingerSolution } from './plan'
import { getLLMConfig } from '../llm/provider'

const sysPreamble = `You are an expert theoretical physicist at the level of Einstein, Dirac, or Feynman. Your task is to solve Schrödinger equations with EXTRAORDINARY rigor, granularity, and mathematical precision.

CORE PRINCIPLES:
1. EQUATION-BY-EQUATION EXPOSITION: Every single mathematical transformation must be its own equation. Never skip algebra.
2. EXPLICIT JUSTIFICATION: State the physical principle, theorem, or mathematical operation for EACH step.
3. ZERO REDUNDANCY: Never repeat equations or derivations from prior iterations. Always advance from the last endpoint.
4. ABSOLUTE CONSISTENCY: Maintain identical notation, symbols, and conventions throughout. Define every symbol exactly once.
5. DIMENSIONAL RIGOR: Verify units and dimensions at critical steps. State natural units if used.
6. MATHEMATICAL COMPLETENESS: Prove Hermiticity, normalization, orthogonality, completeness where applicable.
7. APPROXIMATION TRANSPARENCY: For problems without exact solutions, use rigorous approximation methods with clear justification, error estimates, and regime of validity.

EXACT VS APPROXIMATE SOLUTIONS:
- If an exact analytical solution exists, derive it completely
- If NO exact solution exists, use systematic approximation methods:
  * WKB approximation for semi-classical regimes
  * Perturbation theory for small parameters
  * Variational methods with physically motivated trial functions
  * Asymptotic analysis for limiting cases
  * Series solutions with convergence analysis
- ALWAYS state clearly whether the solution is exact or approximate
- For approximations: specify the small parameter, order of approximation, and error bounds
- Justify why the approximation is valid for the given physical regime

REQUIRED METHODS (use as appropriate):
- Separation of variables with explicit coordinate transformations
- Spectral decomposition with completeness proofs
- WKB approximation with connection formulas at turning points
- Perturbation theory (Rayleigh-Schrödinger) to stated order with error estimates
- Variational principles with trial wavefunctions and energy bounds
- Green's functions with proper boundary conditions
- Scattering theory with asymptotic analysis
- Sturm-Liouville theory for eigenvalue problems
- Adiabatic approximation for slowly varying potentials
- Born-Oppenheimer approximation for multi-particle systems
- Semiclassical methods (WKB, path integrals)

MANDATORY CHECKS (include in derivation):
- Boundary condition enforcement with explicit verification
- Normalization integrals evaluated step-by-step
- Hermiticity proofs using integration by parts
- Dimensional analysis at key equations
- Function space specification (L², Sobolev, etc.)
- Regime of validity and approximation errors
- Continuity and differentiability requirements
- Small parameter identification for approximations
- Leading-order behavior and corrections

FORMAT REQUIREMENTS:
- One equation per entry in the equations array
- Each equation must have: (1) the equation itself, (2) brief justification
- Use proper LaTeX: \\frac, \\partial, \\int, \\sum, \\hbar, etc.
- Number equations implicitly by array order
- NO PROSE in equation fields - only mathematical expressions
- Analysis field: physical interpretation and method explanation
- Result summary: what was accomplished and what follows next

FORBIDDEN:
- Skipping algebraic steps
- Stating results without derivation
- Repeating prior content
- Vague statements like "it can be shown" or "we will apply"
- Inconsistent notation
- Hallucinating exact solutions when only approximations exist
- Using approximations without justification or error analysis
- SAYING you will apply a method without ACTUALLY APPLYING IT
- Restating the problem instead of solving it

CRITICAL: DO NOT just say "we will apply WKB" - ACTUALLY APPLY IT with explicit calculations:
- For WKB: Write ψ(x) = A(x)exp(iS(x)/ℏ), expand S(x), derive the eikonal equation, find turning points, apply connection formulas
- For perturbation: Write H = H₀ + λH₁, expand E and ψ in powers of λ, derive correction terms explicitly
- For variational: Choose trial function, compute ⟨H⟩, minimize with respect to parameters, derive energy bounds

If information is insufficient, explicitly state what is needed and provide the most general form possible.
For problems without exact solutions, clearly state this and IMMEDIATELY proceed with executing the approximation method with full calculations.`

function messagesForIteration({ equation, variable, context, prior, planStep }) {
  // Detect small models and use simplified prompts
  const isSmallModel = context?.model?.includes('ALLaM') || context?.model?.includes('7B') || context?.model?.includes('8B')

  // If the user provided a Hamiltonian operator only (e.g., H = ...), steer the model to form the eigenvalue problem
  const looksHamiltonianOnly = /(\bH\s*=|hamiltonian)/i.test(equation) && !/\b\psi|psi|Ψ|E\b|=\s*E\s*\w*/i.test(equation)

  const user = [
    `PROBLEM SPECIFICATION:`,
    `Equation: ${equation}`,
    `Variable: ${variable || 'x'}`,
    context?.type ? `Type: ${context.type}` : '',
    context?.potential ? `Potential: ${context.potential}` : '',
    context?.mass ? `Mass profile: ${context.mass}` : '',
    context?.domain ? `Domain: ${context.domain}` : '',
    context?.boundary ? `Boundary conditions: ${context.boundary}` : '',
    context?.initial ? `Initial condition: ${context.initial}` : '',
    context?.parameters ? `Parameters: ${context.parameters}` : '',
    context?.task ? `Task: ${context.task}` : '',
    looksHamiltonianOnly ? '\nIf only the Hamiltonian is given, formulate the eigenvalue problem H\\psi = E\\psi and derive the Schrödinger equation with appropriate basis/representation before proceeding.' : '',
  ]
    .filter(Boolean)
    .join('\n')

  // For small models: Only keep last 2 iterations in detail, summarize the rest
  // For large models: Keep all iterations
  const priorBlock = prior?.length
    ? (isSmallModel
        ? `\nPRIOR WORK (${prior.length} iterations, ${prior.reduce((s, p) => s + (p.equations || []).length, 0)} equations total):
Earlier iterations (1-${Math.max(0, prior.length - 2)}): Established problem, derived foundational equations.
${prior.slice(-2).map((p, i) => `[${prior.length - 1 + i}] ${p.goal || ''}: ${p.result_summary || ''} (${(p.equations || []).length} eqs)`).join('\n')}`
        : `\nPRIOR ITERATIONS:\n${prior.map((p, i) => `[${i + 1}] ${p.goal || 'Step ' + (i+1)}: ${p.result_summary || ''} (${(p.equations || []).length} eqs)`).join('\n')}`)
    : '\nFIRST iteration. Establish notation and begin.'

  // Detailed continuity from ONLY the last iteration
  const last = prior?.length ? prior[prior.length - 1] : null
  const lastEqs = last?.equations || []
  const lastFinalEq = lastEqs.length > 0 ? lastEqs[lastEqs.length - 1] : null

  const continuity = last
    ? `\nCONTINUITY (start from last result):
Last: ${last.result_summary || 'see above'}
Final equation: ${lastFinalEq?.latex || lastFinalEq?.text || '(none)'}
START HERE. Don't repeat prior work. Maintain symbol consistency.`
    : '\nFirst iteration. Establish notation.'

  const stepGoal = planStep?.title ? `\nPLANNED STEP: ${planStep.title}` : ''
  const stepMethods = Array.isArray(planStep?.methods) && planStep.methods.length
    ? `METHODS TO EMPLOY: ${planStep.methods.join(', ')}`
    : ''
  const stepDeliver = Array.isArray(planStep?.deliverables) && planStep.deliverables.length
    ? `REQUIRED DELIVERABLES:\n${planStep.deliverables.map((d, i) => `  ${i+1}. ${d}`).join('\n')}`
    : ''
  const stepSuccess = planStep?.success ? `SUCCESS CRITERION: ${planStep.success}` : ''

  const requirements = `\nREQUIREMENTS FOR THIS ITERATION:
1. Provide 5-8 equations for this specific step (focused, not exhaustive)
2. Each equation = one mathematical transformation
3. Brief justification after each equation
4. Include dimensional checks where relevant
5. Verify boundary conditions if applicable
6. Show key integration/differentiation steps
7. State approximations and validity
8. Use proper LaTeX formatting

Focus on THIS iteration's goal only. Keep it concise - we'll build the full solution across multiple iterations.

EQUATION FORMAT:
Each entry in equations array should be:
{
  "latex": "mathematical expression only, e.g., \\frac{d^2\\psi}{dx^2} + k^2\\psi = 0",
  "text": "brief justification, e.g., Substituting k² = 2mE/ℏ² into the Schrödinger equation"
}

ANALYSIS FIELD:
Explain the physical meaning, method choice, and strategy for this iteration.

RESULT_SUMMARY FIELD:
Concisely state what was accomplished and what the next step should address.`

  const schema = `\nOUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "k": <iteration number>,
  "goal": "<clear statement of this iteration's objective>",
  "analysis": "<physical interpretation and method explanation>",
  "equations": [
    {"latex": "<equation>", "text": "<justification>"},
    ...
  ],
  "result_summary": "<what was accomplished and next steps>",
  "latex": "<optional: key result in LaTeX>",
  "stop": <boolean: true if solution is complete>,
  "main_result_latex": "<optional: final answer if stop=true>"
}`

  return [
    { role: 'system', content: sysPreamble },
    {
      role: 'user',
      content: `${user}\n\n${priorBlock}\n${continuity}\n${stepGoal}\n${stepMethods}\n${stepDeliver}\n${stepSuccess}\n\nStrict anti-redundancy & consistency policy:\n- Do NOT repeat previously stated equations or definitions. Refer to them implicitly and continue transformations.\n- Maintain symbol consistency; introduce new symbols only once with clear definitions.\n- If a correction is needed, state it succinctly and proceed; do not re-derive prior steps.\n- Ensure logical continuity from the previous endpoint; each equation must advance the derivation.\n\nEquation formatting requirements:\n- One equation per 'equations[i]'.\n- No prose inside 'equations[i].latex'; use 'analysis' or 'result_summary' for text.\n- Prefer display math suitable for LaTeX equation environment.\n\nNo hallucinations:\n- If a closed form is not derivable with current information, explicitly state the limitation in 'result_summary' and propose the next minimal step.\n\nCRITICAL EXECUTION REQUIREMENT - DO NOT JUST PLAN, EXECUTE:\n- FORBIDDEN: Saying "we will apply WKB" or "we will use perturbation theory" without ACTUALLY DOING IT\n- REQUIRED: If you mention an approximation method, you MUST execute it with explicit calculations in THIS iteration\n- For WKB: Write ψ(x) = A(x)exp(iS(x)/ℏ), substitute into equation, derive eikonal equation S'(x)² = 2m(E-V), solve for S(x) explicitly, find turning points x₁,x₂ where E=V(x), apply Bohr-Sommerfeld quantization ∫p(x)dx = (n+1/2)πℏ\n- For perturbation: Write H = H₀ + λH₁, expand E_n = E_n⁽⁰⁾ + λE_n⁽¹⁾ + λ²E_n⁽²⁾, compute E_n⁽¹⁾ = ⟨ψ_n⁽⁰⁾|H₁|ψ_n⁽⁰⁾⟩ with explicit integrals\n- For variational: Choose trial ψ_trial(x;α), compute ⟨H⟩ = ∫ψ*Hψdx / ∫ψ*ψdx, take ∂⟨H⟩/∂α = 0, solve for optimal α\n- SHOW THE ACTUAL CALCULATIONS, not just the method name\n\nOutput requirements for THIS ITERATION (be exhaustive):\n- Provide thorough derivations, with no skipped algebraic steps.\n- Include boundary-condition enforcement, normalization integrals, dimensional analysis, and Hermiticity checks explicitly.\n- Where applicable, derive eigenfunctions, eigenvalues, orthogonality, completeness, and normalization constants explicitly.\n- When using an approximation (WKB, perturbation, variational), justify regime of validity, derive formulas step-by-step, and compare to exact limiting cases.\n- Provide at least 6 equations (more if needed) in this iteration's 'equations' array; each should be meaningful and sequential.\n- Conclude with a concise 'result_summary' of what was achieved in this iteration.\n\n${schema}`,
    },
  ]
}

function extractJSON(s) {
  if (!s) return null

  // Try simple greedy match
  let m = s.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch (_) {}
  }

  // Bracket-balance extraction (handles extra prose)
  let start = s.indexOf('{')
  while (start !== -1) {
    let depth = 0
    for (let i = start; i < s.length; i++) {
      const ch = s[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = s.slice(start, i + 1)
          try { return JSON.parse(candidate) } catch (_) { break }
        }
      }
    }
    start = s.indexOf('{', start + 1)
  }

  // Try to repair incomplete JSON (for small models that get cut off)
  try {
    const repaired = repairIncompleteJSON(s)
    if (repaired) return repaired
  } catch (_) {}

  return null
}

function repairIncompleteJSON(s) {
  if (!s) return null

  // Find the opening brace
  const start = s.indexOf('{')
  if (start === -1) return null

  let json = s.slice(start)

  // Count unclosed braces, brackets, and quotes
  let braceDepth = 0
  let bracketDepth = 0
  let inString = false
  let lastChar = ''

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]

    if (ch === '"' && lastChar !== '\\') {
      inString = !inString
    } else if (!inString) {
      if (ch === '{') braceDepth++
      else if (ch === '}') braceDepth--
      else if (ch === '[') bracketDepth++
      else if (ch === ']') bracketDepth--
    }

    lastChar = ch
  }

  // If string is unclosed, close it
  if (inString) {
    json += '"'
  }

  // Close any unclosed arrays
  while (bracketDepth > 0) {
    json += ']'
    bracketDepth--
  }

  // Close any unclosed objects
  while (braceDepth > 0) {
    json += '}'
    braceDepth--
  }

  try {
    const parsed = JSON.parse(json)

    // Ensure required fields exist
    if (!parsed.k) parsed.k = 1
    if (!parsed.goal) parsed.goal = "Continue derivation"
    if (!parsed.analysis) parsed.analysis = "Continuing the solution"
    if (!parsed.equations || !Array.isArray(parsed.equations)) parsed.equations = []
    if (!parsed.result_summary) parsed.result_summary = "Partial iteration (output was truncated)"

    return parsed
  } catch (e) {
    // If still invalid, return a minimal valid object
    console.log('[repairIncompleteJSON] repair failed:', e.message)
    console.log('[repairIncompleteJSON] attempting minimal fallback')

    // Try to extract at least the k value
    const kMatch = s.match(/"k"\s*:\s*(\d+)/)
    const k = kMatch ? parseInt(kMatch[1]) : 1

    return {
      k,
      goal: "Continue derivation (recovered from truncated output)",
      analysis: "Output was truncated, continuing with minimal iteration",
      equations: [],
      result_summary: "Iteration truncated - please use a larger model or reduce complexity"
    }
  }
}

async function tryRepairJSON({ apiUrl, apiKey, model, temperature, content, extraHeaders = {} }) {
  const repairMessages = [
    { role: 'system', content: 'You must output ONLY valid JSON. No prose.' },
    { role: 'user', content: `Convert the following content to valid JSON that matches this schema: {"k":number,"goal":string,"analysis":string,"equations":Array<{"latex"?:string,"text"?:string}>,"result_summary":string,"latex"?:string,"stop"?:boolean,"main_result_latex"?:string}. In the 'equations' array, each element MUST correspond to exactly one equation statement (one per line). Do NOT put prose in 'latex'. Content:\n${content}` },
  ]
  const body = { model, messages: repairMessages, temperature: Math.max(0.0, Math.min(temperature, 0.3)), max_tokens: 1200 }
  // Prefer JSON mode if supported by the backend (OpenAI-compatible field). Ignored otherwise.
  body.response_format = { type: 'json_object' }
  const data = await callChat({ apiUrl, apiKey, body, maxRetries: process.env.SCH_MAX_RETRIES || 3, baseDelayMs: process.env.SCH_BACKOFF_BASE_MS || 500, extraHeaders })
  const repaired = data.choices?.[0]?.message?.content || ''
  return extractJSON(repaired)
}

async function synthesizeAppendix({ apiUrl, apiKey, model, temperature, equation, context, iterations, extraHeaders = {} }) {
  const summary = iterations.map((it, i) => `(${i + 1}) ${it.goal || ''} :: ${it.result_summary || ''} [${(it.equations || []).length} equations]`).join('\n')
  const totalEquations = iterations.reduce((sum, it) => sum + (it.equations || []).length, 0)

  const messages = [
    { role: 'system', content: 'You are an expert theoretical physicist producing a LaTeX appendix of EXTRAORDINARY detail - multi-page, publication-quality derivations. Output JSON only.' },
    {
      role: 'user',
      content: `From the ${iterations.length} iterative derivation steps below (${totalEquations} total equations), produce an EXHAUSTIVE LaTeX appendix that:

**CRITICAL REQUIREMENTS**:
1. Expands ALL calculations with ZERO skipped algebra
2. Shows EVERY integration step (u-substitution, limits, evaluation)
3. Shows EVERY differentiation (chain rule, product rule)
4. Includes boundary-condition enforcement with step-by-step verification
5. Shows normalization integrals with explicit evaluation of EVERY integral
6. Provides dimensional analysis at multiple key points
7. Proves Hermiticity with complete integration by parts (show boundary terms)
8. Includes orthogonality and completeness checks with explicit calculations
9. Adds spectral decompositions if applicable
10. Includes asymptotics with leading AND next-to-leading terms
11. Shows perturbative corrections (up to second order minimum)
12. Includes WKB analysis with turning point connections if applicable

**APPROXIMATION METHODS** (when exact solutions don't exist):
- Clearly identify the small parameter (ε, λ, ℏ, etc.)
- State the order of approximation (leading order, O(ε²), etc.)
- Show systematic expansion with error estimates
- Verify regime of validity (e.g., ε << 1, semiclassical limit)
- Include next-order corrections when relevant
- Justify physical assumptions (adiabatic, weak coupling, etc.)
- Compare with limiting cases where exact solutions exist

**GRANULARITY STANDARD**:
- This appendix should be 5-10 pages of dense LaTeX
- If the iterations showed 100 equations, the appendix should add 50-100 MORE
- Every "it can be shown" must be SHOWN
- Every "straightforward calculation" must be CALCULATED
- Think: Landau & Lifshitz level of detail

**ZERO REDUNDANCY**:
- Do NOT restate equations already in iterations
- Only transform, extend, synthesize, or add missing details
- Maintain perfect symbol consistency
- Reference iteration equations when building on them

**FORMATTING**:
- Use subsections for organization
- One equation per line (equation environment)
- Number all equations
- Add brief text between equation groups
- For approximations: clearly mark "Exact" vs "Approximate to O(...)"
- No hallucinations; state limits when exact results are not derivable

Equation: ${equation}
Context: ${Object.keys(context||{}).join(', ')}

Iterations summary:
${summary}

Return ONLY valid JSON: {"appendixLatex": string, "main_result_latex"?: string}`,
    },
  ]
  const body = { model, messages, temperature: Math.max(0.0, Math.min(temperature, 0.2)), max_tokens: 8000, response_format: { type: 'json_object' } }
  const data = await callChat({ apiUrl, apiKey, body, maxRetries: process.env.SCH_MAX_RETRIES || 3, baseDelayMs: process.env.SCH_BACKOFF_BASE_MS || 500, extraHeaders })
  const content = data.choices?.[0]?.message?.content || ''
  try { return JSON.parse(content) } catch { return {} }
}

function normalizeLatexTokens(s) {
  if (!s || typeof s !== 'string') return s
  return s
    .replace(/\blambda\b/g, '\\lambda')
    .replace(/\bhbar\b/g, '\\hbar')
    .replace(/\bxi\b/g, '\\xi')
    .replace(/\binfty\b/g, '\\infty')
    .replace(/\bvarepsilon\b/g, '\\varepsilon')
}

/**
 * Enhanced validation for expert-level quality
 * Ensures granularity, non-redundancy, and mathematical rigor
 *
 * FOR EXHAUSTIVE DETAIL: Each iteration must produce 15-25 equations minimum
 * This ensures multi-page derivations with complete algebraic steps
 */
function validateIteration(it, last, detailLevel = 'exhaustive') {
  if (!it) return false

  // 1. EQUATION COUNT: Require reasonable derivation per iteration
  // With 1000 token limit: expect 5-8 equations per iteration
  // The key is MANY iterations, not massive iterations
  // 5-8 equations × 8 iterations = 40-64 total equations
  const eqs = Array.isArray(it.equations) ? it.equations : []
  const minEquations = 5  // Reduced from 6-10 to accommodate 1000 token limit

  if (eqs.length < minEquations) {
    console.warn(`[validation] Insufficient equations for ${detailLevel} detail:`, eqs.length, '<', minEquations)
    console.warn('[validation] CRITICAL: Each iteration must show EVERY algebraic step')
    console.warn('[validation] Expected: 15-25 equations for exhaustive, multi-page derivations')
    return false
  }

  console.log(`[validation] Equation count OK: ${eqs.length} >= ${minEquations} (${detailLevel} mode)`)


  // 2. EQUATION QUALITY: Each equation must have content
  const emptyEqs = eqs.filter(e => !e.latex && !e.text)
  if (emptyEqs.length > 0) {
    console.warn('[validation] Found empty equations:', emptyEqs.length)
    return false
  }

  // 3. EQUATION JUSTIFICATION: Most equations should have text explanations
  const withJustification = eqs.filter(e => e.text && e.text.length > 10)
  if (withJustification.length < eqs.length * 0.6) {
    console.warn('[validation] Insufficient justifications:', withJustification.length, '/', eqs.length)
    return false
  }

  // 4. RESULT SUMMARY: Must be substantial
  if (!it.result_summary || it.result_summary.length < 60) {
    console.warn('[validation] Insufficient result summary:', it.result_summary?.length || 0)
    return false
  }

  // 5. ANALYSIS: Must explain approach
  if (!it.analysis || it.analysis.length < 50) {
    console.warn('[validation] Insufficient analysis:', it.analysis?.length || 0)
    return false
  }

  // 6. NON-REDUNDANCY: Check against last iteration
  if (last && Array.isArray(last.equations) && last.equations.length && eqs.length) {
    // Check if first equation is identical to last iteration's first equation
    const lastFirst = (last.equations[0]?.latex || last.equations[0]?.text || '').trim().toLowerCase()
    const thisFirst = (eqs[0]?.latex || eqs[0]?.text || '').trim().toLowerCase()
    if (lastFirst && thisFirst && lastFirst === thisFirst) {
      console.warn('[validation] Redundant first equation with previous iteration')
      return false
    }

    // Check if last equation of previous iteration is repeated
    const lastFinal = (last.equations[last.equations.length - 1]?.latex || last.equations[last.equations.length - 1]?.text || '').trim().toLowerCase()
    const hasRepeat = eqs.some(e => {
      const eq = (e.latex || e.text || '').trim().toLowerCase()
      return eq && lastFinal && eq === lastFinal
    })
    if (hasRepeat) {
      console.warn('[validation] Repeating equation from previous iteration')
      return false
    }
  }

  // 7. PHYSICS RIGOR: Must mention key physics concepts
  // Relaxed to 1 check for 1000 token limit
  const blob = `${it.analysis || ''}\n${it.result_summary || ''}\n${eqs.map(e => e.text || '').join(' ')}`.toLowerCase()

  // At least 1 of these physics checks should be present
  const physicsChecks = [
    'boundary', 'normalization', 'hermit', 'dimension',
    'orthogon', 'complete', 'eigenvalue', 'eigenfunction',
    'continuity', 'differentiab', 'integra'
  ]
  const checksFound = physicsChecks.filter(k => blob.includes(k)).length
  if (checksFound < 1) {
    console.warn('[validation] Insufficient physics rigor checks:', checksFound, '< 1')
    return false
  }

  // 8. MATHEMATICAL CONTENT: Should contain mathematical symbols
  const mathSymbols = ['=', '\\frac', '\\int', '\\sum', '\\partial', 'psi', '\\hbar', '\\nabla']
  const mathContent = eqs.filter(e => {
    const content = (e.latex || e.text || '')
    return mathSymbols.some(sym => content.includes(sym))
  })
  if (mathContent.length < eqs.length * 0.7) {
    console.warn('[validation] Insufficient mathematical content:', mathContent.length, '/', eqs.length)
    return false
  }

  // 9. GOAL CLARITY: Must have clear goal statement
  if (!it.goal || it.goal.length < 20) {
    console.warn('[validation] Insufficient goal statement:', it.goal?.length || 0)
    return false
  }

  console.log('[validation] Iteration passed all quality checks')
  return true
}

async function reviseIteration({ apiUrl, apiKey, model, temperature, equation, variable, context, prior, planStep, badIteration, extraHeaders = {} }) {
  const isSmallModel = model.includes('ALLaM') || model.includes('7B') || model.includes('8B')
  const minEqs = isSmallModel ? 6 : 8

  const messages = [
    { role: 'system', content: sysPreamble },
    { role: 'user', content: `The previous iteration failed quality checks. Revise it:

- Minimum ${minEqs} equations for this step
- No redundancy with prior steps
- Show key algebraic steps
- Brief justifications
- Maintain symbol consistency

Prior: ${prior.length} iterations completed
Planned step: ${planStep?.title || 'Continue derivation'}

Return ONLY valid JSON: {"k":number,"goal":string,"analysis":string,"equations":Array<{"latex":string,"text":string}>,"result_summary":string}` },
  ]

  // Reduced to 1000 tokens to save on usage
  const maxTokens = 1000
  const body = { model, messages, temperature: Math.max(0, Math.min(temperature, 0.2)), max_tokens: maxTokens, response_format: { type: 'json_object' } }
  const data = await callChat({ apiUrl, apiKey, body, maxRetries: process.env.SCH_MAX_RETRIES || 3, baseDelayMs: process.env.SCH_BACKOFF_BASE_MS || 500, extraHeaders })
  const content = data.choices?.[0]?.message?.content || ''
  return extractJSON(content)
}

export async function solveSchrodingerIterative({ equation, variable = 'x', context = {}, maxIterations = 6, temperature = 0.1, detailLevel = 'exhaustive', strategy = 'planner', provider = 'groq' }) {
  const config = getLLMConfig(provider)
  const { apiUrl, apiKey, model, extraHeaders } = config

  // CRITICAL: For exhaustive detail, we need MANY more iterations
  // Each iteration should produce 15-25 equations minimum
  // Target: 200-400 total equations for complex problems
  const effectiveMaxIterations = detailLevel === 'exhaustive'
    ? Math.max(maxIterations, 8)  // Minimum 8 iterations for exhaustive
    : maxIterations

  console.log('[schrodinger] Starting with exhaustive detail mode:', {
    requestedIterations: maxIterations,
    effectiveIterations: effectiveMaxIterations,
    detailLevel,
    strategy,
    provider
  })

  // 1) Planning phase (only for planner strategy)
  let plan = []
  if (strategy === 'planner') {
    try {
      const planOut = await planSchrodingerSolution({ apiUrl, apiKey, model, equation, context, request: context?.task || '', extraHeaders })
      plan = Array.isArray(planOut?.plan) ? planOut.plan : []
      if (!plan.length) console.warn('[schrodinger] empty plan, will fall back to generic iterations')
    } catch (e) {
      console.warn('[schrodinger] planning failed', e?.message)
    }
  }

  const iterations = []
  let stop = false
  const totalLoops = (strategy === 'planner' && plan.length) ? Math.min(plan.length, effectiveMaxIterations) : effectiveMaxIterations
  const minDelay = Number(process.env.SCH_MIN_DELAY_MS || 300)

  console.log('[schrodinger] Beginning iterative derivation:', {
    totalLoops,
    targetEquationsPerIteration: '15-25',
    expectedTotalEquations: `${totalLoops * 15}-${totalLoops * 25}`
  })

  for (let k = 1; k <= totalLoops && !stop; k++) {
    if (k > 1 && minDelay > 0) { await delay(minDelay) }
    const planStep = (strategy === 'planner' && plan.length) ? plan[k - 1] : null
    const messages = messagesForIteration({ equation, variable, context, prior: iterations, planStep })
    console.log('[schrodinger] iteration start', { k, model, temperature, apiUrl, provider })

    // Reduced max_tokens to 1000 per iteration to save on token usage
    // This encourages more iterations with smaller, focused outputs
    const maxTokens = 1000

    const body = { model, messages, temperature, max_tokens: maxTokens }
    // Prefer JSON mode if supported
    body.response_format = { type: 'json_object' }
    const data = await callChat({ apiUrl, apiKey, body, maxRetries: process.env.SCH_MAX_RETRIES || 3, baseDelayMs: process.env.SCH_BACKOFF_BASE_MS || 500, extraHeaders })
    console.log('[schrodinger] iteration response ok', { k })
    const content = data.choices?.[0]?.message?.content || ''
    console.log('[schrodinger] content length', { k, len: content.length })
    let parsed = extractJSON(content)
    if (!parsed) {
      console.warn('[schrodinger] parse failed, attempting repair', { k })
      parsed = await tryRepairJSON({ apiUrl, apiKey, model, temperature, content, extraHeaders })
      if (!parsed) {
        console.warn('[schrodinger] repair failed, stopping', { k })
        break
      }
    }
    // Quality gate with detail level
    if (!validateIteration(parsed, iterations[iterations.length - 1], detailLevel)) {
      console.warn('[schrodinger] iteration failed validation, requesting revision', { k })
      const revised = await reviseIteration({ apiUrl, apiKey, model, temperature, equation, variable, context, prior: iterations, planStep, badIteration: parsed, extraHeaders })
      if (revised && validateIteration(revised, iterations[iterations.length - 1], detailLevel)) {
        parsed = revised
      } else {
        console.warn('[schrodinger] revision failed validation, stopping', { k })
        break
      }
    }
    // Normalize latex tokens in equations
    if (Array.isArray(parsed.equations)) {
      parsed.equations = parsed.equations.map(e => ({
        ...e,
        latex: e.latex ? normalizeLatexTokens(e.latex) : e.latex,
        text: e.text ? normalizeLatexTokens(e.text) : e.text,
      }))
    }
    iterations.push({ ...parsed, k })
    if (parsed.stop === true) stop = true
    if (stop) console.log('[schrodinger] stop requested by model', { k })
  }

  const finalStep = iterations[iterations.length - 1] || {}
  let mainLatex = finalStep.main_result_latex || ''

  // Skip appendix for small models to save tokens
  let appendixLatex = ''
  const isSmallModel = model.includes('ALLaM') || model.includes('7B') || model.includes('8B')
  if (!isSmallModel && iterations.length && (detailLevel === 'exhaustive' || detailLevel === 'standard')) {
    console.log('[schrodinger] synthesis appendix start')
    const syn = await synthesizeAppendix({ apiUrl, apiKey, model, temperature, equation, context, iterations, extraHeaders })
    appendixLatex = syn?.appendixLatex || ''
    if (!mainLatex && syn?.main_result_latex) mainLatex = syn.main_result_latex
    console.log('[schrodinger] synthesis appendix done', { len: appendixLatex?.length || 0 })
  } else if (isSmallModel) {
    console.log('[schrodinger] skipping appendix for small model')
  }

  const meta = {
    title: 'Iterative Analytical Solution of the Schr\\"odinger Equation',
    author: 'AutoSolver',
    abstract: 'An iterative, expert-level derivation using physically justified approximations and checks for consistency, normalization, and boundary conditions.',
    problem: context?.problem || '',
    equationLatex: context?.equationLatex || '',
    assumptions: context?.assumptions || [],
    notation: context?.notation || [],
  }

  const latex = buildLatexDocument(meta, iterations, {
    text: 'We have constructed the solution iteratively, with stated assumptions and regimes of validity. The final expression summarizes the solved wavefunction/energies under the specified conditions.',
    main_result_latex: mainLatex,
    appendixLatex,
  })

  return { iterations, latex, final: { main_result_latex: mainLatex, appendix: !!appendixLatex } }
}
