// --- Utilities: delay and API call with backoff to avoid 429s ---
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

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
        throw new Error(`HTTP ${resp.status} ${t?.slice(0,200) || ''}`)
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

REQUIRED METHODS (use as appropriate):
- Separation of variables with explicit coordinate transformations
- Spectral decomposition with completeness proofs
- WKB approximation with connection formulas at turning points
- Perturbation theory (Rayleigh-Schrödinger) to stated order
- Variational principles with trial wavefunctions and energy bounds
- Green's functions with proper boundary conditions
- Scattering theory with asymptotic analysis
- Sturm-Liouville theory for eigenvalue problems

MANDATORY CHECKS (include in derivation):
- Boundary condition enforcement with explicit verification
- Normalization integrals evaluated step-by-step
- Hermiticity proofs using integration by parts
- Dimensional analysis at key equations
- Function space specification (L², Sobolev, etc.)
- Regime of validity and approximation errors
- Continuity and differentiability requirements

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
- Vague statements like "it can be shown"
- Inconsistent notation
- Hallucinating results not derivable from given information

If information is insufficient, explicitly state what is needed and provide the most general form possible.`

function messagesForIteration({ equation, variable, context, prior, planStep }) {
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

  const priorBlock = prior?.length
    ? `\nPRIOR ITERATIONS (DO NOT REPEAT - BUILD UPON):\n${prior.map((p, i) => `[${i + 1}] ${p.goal || 'Step ' + (i+1)}\n    Summary: ${p.result_summary || ''}\n    Equations derived: ${(p.equations || []).length}`).join('\n')}`
    : '\nThis is the FIRST iteration. Start from the fundamental equation.'

  // Build a detailed continuity requirement from the last iteration
  const last = prior?.length ? prior[prior.length - 1] : null
  const lastEqs = last?.equations || []
  const lastFinalEq = lastEqs.length > 0 ? lastEqs[lastEqs.length - 1] : null

  const continuity = last
    ? `\nCONTINUITY REQUIREMENT (CRITICAL):
    - Previous step ended with: ${last.result_summary || 'see above'}
    - Last equation derived: ${lastFinalEq?.latex || lastFinalEq?.text || '(none)'}
    - You MUST start from this endpoint
    - DO NOT restate or re-derive any equation from prior iterations
    - Every equation you write must be NEW and advance the solution
    - Maintain EXACT symbol consistency with prior iterations`
    : '\nThis is the first iteration. Establish notation and begin derivation.'

  const stepGoal = planStep?.title ? `\nPLANNED STEP: ${planStep.title}` : ''
  const stepMethods = Array.isArray(planStep?.methods) && planStep.methods.length
    ? `METHODS TO EMPLOY: ${planStep.methods.join(', ')}`
    : ''
  const stepDeliver = Array.isArray(planStep?.deliverables) && planStep.deliverables.length
    ? `REQUIRED DELIVERABLES:\n${planStep.deliverables.map((d, i) => `  ${i+1}. ${d}`).join('\n')}`
    : ''
  const stepSuccess = planStep?.success ? `SUCCESS CRITERION: ${planStep.success}` : ''

  const requirements = `\nREQUIREMENTS FOR THIS ITERATION (CRITICAL - MULTI-PAGE DETAIL):
1. **MINIMUM 15-25 EQUATIONS** - This is NON-NEGOTIABLE for exhaustive detail
2. Each equation must be a SINGLE mathematical statement (one transformation per equation)
3. After EVERY equation, provide detailed justification (what operation, what theorem, why valid)
4. Include dimensional checks at 3-5 key points with explicit unit verification
5. Verify boundary conditions explicitly with step-by-step substitution
6. Show normalization integral evaluation with EVERY integration step shown
7. Prove Hermiticity with complete integration by parts (show boundary terms vanishing)
8. State approximations, their validity regime, AND error estimates
9. **ABSOLUTELY NO SKIPPED ALGEBRA**:
   - Show every substitution explicitly
   - Show every integration step (u-substitution, limits, evaluation)
   - Show every differentiation (chain rule, product rule applications)
   - Expand every product before simplifying
   - Show intermediate steps in factorizations
10. Use proper LaTeX formatting with \\frac, \\partial, \\int, \\sum, etc.

**GRANULARITY STANDARD**:
- If a textbook would show 5 equations, you show 15
- If a paper would show 10 equations, you show 25
- Every "trivial" step must be explicit
- Think: "Could a first-year graduate student follow this without filling in gaps?"

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
      content: `${user}\n\n${priorBlock}\n${continuity}\n${stepGoal}\n${stepMethods}\n${stepDeliver}\n${stepSuccess}\n\nStrict anti-redundancy & consistency policy:\n- Do NOT repeat previously stated equations or definitions. Refer to them implicitly and continue transformations.\n- Maintain symbol consistency; introduce new symbols only once with clear definitions.\n- If a correction is needed, state it succinctly and proceed; do not re-derive prior steps.\n- Ensure logical continuity from the previous endpoint; each equation must advance the derivation.\n\nEquation formatting requirements:\n- One equation per 'equations[i]'.\n- No prose inside 'equations[i].latex'; use 'analysis' or 'result_summary' for text.\n- Prefer display math suitable for LaTeX equation environment.\n\nNo hallucinations:\n- If a closed form is not derivable with current information, explicitly state the limitation in 'result_summary' and propose the next minimal step.\n\nOutput requirements for THIS ITERATION (be exhaustive):\n- Provide thorough derivations, with no skipped algebraic steps.\n- Include boundary-condition enforcement, normalization integrals, dimensional analysis, and Hermiticity checks explicitly.\n- Where applicable, derive eigenfunctions, eigenvalues, orthogonality, completeness, and normalization constants explicitly.\n- When using an approximation (WKB, perturbation, variational), justify regime of validity, derive formulas step-by-step, and compare to exact limiting cases.\n- Provide at least 6 equations (more if needed) in this iteration's 'equations' array; each should be meaningful and sequential.\n- Conclude with a concise 'result_summary' of what was achieved in this iteration.\n\n${schema}`,
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
  return null
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

  // 1. EQUATION COUNT: Require SUBSTANTIAL derivation
  // For exhaustive detail: 15-25 equations per iteration
  // For standard: 10-15 equations
  // For basic: 8-10 equations
  const eqs = Array.isArray(it.equations) ? it.equations : []
  const minEquations = detailLevel === 'exhaustive' ? 15 : (detailLevel === 'standard' ? 10 : 8)

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
  const blob = `${it.analysis || ''}\n${it.result_summary || ''}\n${eqs.map(e => e.text || '').join(' ')}`.toLowerCase()

  // At least 2 of these physics checks should be present
  const physicsChecks = [
    'boundary', 'normalization', 'hermit', 'dimension',
    'orthogon', 'complete', 'eigenvalue', 'eigenfunction',
    'continuity', 'differentiab', 'integra'
  ]
  const checksFound = physicsChecks.filter(k => blob.includes(k)).length
  if (checksFound < 2) {
    console.warn('[validation] Insufficient physics rigor checks:', checksFound, '< 2')
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
  const messages = [
    { role: 'system', content: sysPreamble },
    { role: 'user', content: `The previous iteration failed quality checks (redundancy, continuity, or insufficient detail).

CRITICAL FAILURE: The iteration did not meet the exhaustive detail standard.

Revise it strictly following these constraints:
- **MINIMUM 15-25 EQUATIONS** - This is NON-NEGOTIABLE
- No redundancy with prior steps; continue from last endpoint
- Show EVERY algebraic step explicitly (no skipped steps)
- Include boundary enforcement with step-by-step verification
- Show normalization integrals with every integration step
- Prove Hermiticity with complete integration by parts
- Include dimensional checks with explicit unit verification
- Maintain perfect symbol consistency
- Provide detailed justification for EVERY equation

Prior summary:
${prior.map((p, i) => `(${i+1}) ${p.result_summary || p.goal || ''} [${(p.equations || []).length} equations]`).join('\n')}

Planned step: ${planStep?.title || ''}
Methods: ${(planStep?.methods || []).join(', ')}
Deliverables: ${(planStep?.deliverables || []).join('; ')}

**REMEMBER**: If a textbook shows 5 equations, you show 15. If a paper shows 10, you show 25.
Every "trivial" step must be explicit. Think multi-page derivation.

Return ONLY valid JSON with keys:{"k":number,"goal":string,"analysis":string,"equations":Array<{"latex"?:string,"text"?:string}>,"result_summary":string,"latex"?:string,"stop"?:boolean,"main_result_latex"?:string}` },
  ]
  const body = { model, messages, temperature: Math.max(0, Math.min(temperature, 0.2)), max_tokens: 8000, response_format: { type: 'json_object' } }
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

    // CRITICAL: Increase max_tokens dramatically for exhaustive detail
    // Each iteration should produce 15-25 equations with full justifications
    // This requires 6000-8000 tokens per iteration
    const maxTokens = detailLevel === 'exhaustive' ? 8000 : 3500

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

  let appendixLatex = ''
  if (iterations.length && (detailLevel === 'exhaustive' || detailLevel === 'standard')) {
    console.log('[schrodinger] synthesis appendix start')
    const syn = await synthesizeAppendix({ apiUrl, apiKey, model, temperature, equation, context, iterations, extraHeaders })
    appendixLatex = syn?.appendixLatex || ''
    if (!mainLatex && syn?.main_result_latex) mainLatex = syn.main_result_latex
    console.log('[schrodinger] synthesis appendix done', { len: appendixLatex?.length || 0 })
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
