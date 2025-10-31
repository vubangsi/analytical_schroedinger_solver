import { buildLatexDocument } from './latexBuilder'
import { planSchrodingerSolution } from './plan'

const sysPreamble = `You are an expert theoretical physicist. Solve non-relativistic time-independent or time-dependent Schr\"odinger equations with rigorous, explicit, and iterative reasoning, stating all assumptions and approximations. Use physically justified methods: separation of variables, spectral decomposition, WKB, perturbation theory, variational principles, Green's functions, scattering theory, boundary condition enforcement, normalization, completeness, and orthogonality. Always derive and verify units and dimensions, confirm Hermiticity, specify function spaces, and state regimes of validity.`

function messagesForIteration({ equation, variable, context, prior, planStep }) {
  // If the user provided a Hamiltonian operator only (e.g., H = ...), steer the model to form the eigenvalue problem
  const looksHamiltonianOnly = /(\bH\s*=|hamiltonian)/i.test(equation) && !/\b\psi|psi|Ψ|E\b|=\s*E\s*\w*/i.test(equation)
  const user = [
    `Equation: ${equation}`,
    `Variable: ${variable || 'x'}`,
    context?.type ? `Type: ${context.type}` : '',
    context?.potential ? `Potential: ${context.potential}` : '',
    context?.mass ? `Mass: ${context.mass}` : '',
    context?.domain ? `Domain: ${context.domain}` : '',
    context?.boundary ? `Boundary conditions: ${context.boundary}` : '',
    context?.initial ? `Initial condition: ${context.initial}` : '',
    context?.parameters ? `Parameters: ${context.parameters}` : '',
    context?.task ? `Task: ${context.task}` : '',
    looksHamiltonianOnly ? 'If only the Hamiltonian is given, formulate the eigenvalue problem H\\psi = E\\psi and derive the Schr\\"odinger equation with appropriate basis/representation before proceeding.' : '',
    'Goal: Produce the next rigorous iteration advancing the solution, not repeating prior content.',
  ]
    .filter(Boolean)
    .join('\n')

  const priorBlock = prior?.length
    ? `Prior iterations summary (do not repeat):\n${prior.map((p, i) => `(${i + 1}) ${p.result_summary || p.goal || ''}`).join('\n')}`
    : ''

  // Build a minimal continuity summary from the last iteration
  const last = prior?.length ? prior[prior.length - 1] : null
  const continuity = last
    ? `Continuity:
    - Last goal: ${last.goal || ''}
    - Last summary: ${last.result_summary || ''}
    - Continue directly from the last derived equation(s). Do NOT restate them; only transform or extend.`
    : ''

  const stepGoal = planStep?.title ? `Planned step: ${planStep.title}` : ''
  const stepMethods = Array.isArray(planStep?.methods) && planStep.methods.length ? `Methods to use: ${planStep.methods.join(', ')}` : ''
  const stepDeliver = Array.isArray(planStep?.deliverables) && planStep.deliverables.length ? `Deliverables: ${planStep.deliverables.join('; ')}` : ''
  const stepSuccess = planStep?.success ? `Success criterion: ${planStep.success}` : ''

  const schema = `Return ONLY valid JSON with keys:{"k":number,"goal":string,"analysis":string,"equations":Array<{"latex"?:string,"text"?:string}>,"result_summary":string,"latex"?:string,"stop"?:boolean,"main_result_latex"?:string}`

  return [
    { role: 'system', content: sysPreamble },
    {
      role: 'user',
      content: `${user}\n\n${priorBlock}\n${continuity}\n${stepGoal}\n${stepMethods}\n${stepDeliver}\n${stepSuccess}\n\nStrict anti-redundancy & consistency policy:\n- Do NOT repeat previously stated equations or definitions. Refer to them implicitly and continue transformations.\n- Maintain symbol consistency; introduce new symbols only once with clear definitions.\n- If a correction is needed, state it succinctly and proceed; do not re-derive prior steps.\n- Ensure logical continuity from the previous endpoint; each equation must advance the derivation.\n\nOutput requirements for THIS ITERATION (be exhaustive):\n- Provide thorough derivations, with no skipped algebraic steps.\n- Include boundary-condition enforcement, normalization integrals, dimensional analysis, and Hermiticity checks explicitly.\n- Where applicable, derive eigenfunctions, eigenvalues, orthogonality, completeness, and normalization constants explicitly.\n- When using an approximation (WKB, perturbation, variational), justify regime of validity, derive formulas step-by-step, and compare to exact limiting cases.\n- Provide at least 6 equations (more if needed) in this iteration's 'equations' array; each should be meaningful and sequential.\n- Conclude with a concise 'result_summary' of what was achieved in this iteration.\n\n${schema}`,
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

async function tryRepairJSON({ apiUrl, apiKey, model, temperature, content }) {
  const repairMessages = [
    { role: 'system', content: 'You must output ONLY valid JSON. No prose.' },
    { role: 'user', content: `Convert the following content to valid JSON that matches this schema: {"k":number,"goal":string,"analysis":string,"equations":Array<{"latex"?:string,"text"?:string}>,"result_summary":string,"latex"?:string,"stop"?:boolean,"main_result_latex"?:string}. Content:\n${content}` },
  ]
  const body = { model, messages: repairMessages, temperature: Math.max(0.0, Math.min(temperature, 0.3)), max_tokens: 1200 }
  // Prefer JSON mode if supported by the backend (OpenAI-compatible field). Ignored otherwise.
  body.response_format = { type: 'json_object' }
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  const repaired = data.choices?.[0]?.message?.content || ''
  return extractJSON(repaired)
}

async function synthesizeAppendix({ apiUrl, apiKey, model, temperature, equation, context, iterations }) {
  const summary = iterations.map((it, i) => `(${i + 1}) ${it.goal || ''} :: ${it.result_summary || ''}`).join('\n')
  const messages = [
    { role: 'system', content: 'You are an expert theoretical physicist producing a LaTeX appendix of extremely detailed derivations. Output JSON only.' },
    {
      role: 'user',
      content: `From the iterative derivation steps below, produce an exhaustive LaTeX appendix that expands all calculations with no skipped algebra, includes: boundary-condition enforcement, normalization integrals with explicit evaluation, dimensional analysis, Hermiticity proofs with integration by parts, orthogonality and completeness checks, spectral decompositions if applicable, asymptotics, perturbative corrections (up to second order if meaningful), and WKB leading + next-to-leading terms with turning point analysis if meaningful.\n\nBe extremely strict about zero redundancy and high continuity:\n- Do NOT restate equations or text already covered in iterations; only transform, extend, or synthesize.\n- Maintain symbol consistency; define any new symbols exactly once.\n- Ensure every equation advances the derivation with explicit references as needed.\n\nStructure with subsections and many numbered equations.\n\nEquation: ${equation}\nContext keys: ${Object.keys(context||{}).join(', ')}\n\nIterations summary:\n${summary}\n\nReturn ONLY valid JSON: {"appendixLatex": string, "main_result_latex"?: string}`,
    },
  ]
  const body = { model, messages, temperature: Math.max(0.0, Math.min(temperature, 0.2)), max_tokens: 3500, response_format: { type: 'json_object' } }
  const resp = await fetch(apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!resp.ok) return {}
  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content || ''
  try { return JSON.parse(content) } catch { return {} }
}

export async function solveSchrodingerIterative({ equation, variable = 'x', context = {}, maxIterations = 6, temperature = 0.1, detailLevel = 'exhaustive' }) {
  const apiKey = process.env.GROQ_API_KEY
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  // 1) Planning phase
  let plan = []
  try {
    const planOut = await planSchrodingerSolution({ apiUrl, apiKey, model, equation, context, request: context?.task || '' })
    plan = Array.isArray(planOut?.plan) ? planOut.plan : []
    if (!plan.length) console.warn('[schrodinger] empty plan, will fall back to generic iterations')
  } catch (e) {
    console.warn('[schrodinger] planning failed', e?.message)
  }

  const iterations = []
  let stop = false
  const totalLoops = plan.length ? Math.min(plan.length, maxIterations) : maxIterations
  for (let k = 1; k <= totalLoops && !stop; k++) {
    const planStep = plan.length ? plan[k - 1] : null
    const messages = messagesForIteration({ equation, variable, context, prior: iterations, planStep })
    console.log('[schrodinger] iteration start', { k, model, temperature, apiUrl })
    const body = { model, messages, temperature, max_tokens: 3500 }
    // Prefer JSON mode if supported
    body.response_format = { type: 'json_object' }
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    console.log('[schrodinger] iteration response status', { k, status: resp.status })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error('[schrodinger] API error body', { k, text: text?.slice(0, 500) })
      throw new Error(`API error ${resp.status}`)
    }
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || ''
    console.log('[schrodinger] content length', { k, len: content.length })
    let parsed = extractJSON(content)
    if (!parsed) {
      console.warn('[schrodinger] parse failed, attempting repair', { k })
      parsed = await tryRepairJSON({ apiUrl, apiKey, model, temperature, content })
      if (!parsed) {
        console.warn('[schrodinger] repair failed, stopping', { k })
        break
      }
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
    const syn = await synthesizeAppendix({ apiUrl, apiKey, model, temperature, equation, context, iterations })
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
