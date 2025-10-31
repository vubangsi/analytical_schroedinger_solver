import { buildLatexDocument } from './latexBuilder'

const sysPreamble = `You are an expert theoretical physicist. Solve non-relativistic time-independent or time-dependent Schr\"odinger equations with rigorous, explicit, and iterative reasoning, stating all assumptions and approximations. Use physically justified methods: separation of variables, spectral decomposition, WKB, perturbation theory, variational principles, Green's functions, scattering theory, boundary condition enforcement, normalization, completeness, and orthogonality. Always derive and verify units and dimensions, confirm Hermiticity, specify function spaces, and state regimes of validity.`

function messagesForIteration({ equation, variable, context, prior }) {
  const user = [
    `Equation: ${equation}`,
    `Variable: ${variable || 'x'}`,
    context?.type ? `Type: ${context.type}` : '',
    context?.potential ? `Potential: ${context.potential}` : '',
    context?.domain ? `Domain: ${context.domain}` : '',
    context?.boundary ? `Boundary conditions: ${context.boundary}` : '',
    context?.initial ? `Initial condition: ${context.initial}` : '',
    context?.parameters ? `Parameters: ${context.parameters}` : '',
    'Goal: Produce the next rigorous iteration advancing the solution, not repeating prior content.',
  ]
    .filter(Boolean)
    .join('\n')

  const priorBlock = prior?.length
    ? `Prior iterations summary (do not repeat):\n${prior.map((p, i) => `(${i + 1}) ${p.result_summary || p.goal || ''}`).join('\n')}`
    : ''

  const schema = `Return ONLY valid JSON with keys: {"k": number, "goal": string, "analysis": string, "equations": Array<{"latex"?: string, "text"?: string}>, "result_summary": string, "latex"?: string, "stop"?: boolean, "main_result_latex"?: string}`

  return [
    { role: 'system', content: sysPreamble },
    {
      role: 'user',
      content: `${user}\n\n${priorBlock}\n\n${schema}`,
    },
  ]
}

function extractJSON(s) {
  if (!s) return null
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch (_) {
    return null
  }
}

export async function solveSchrodingerIterative({ equation, variable = 'x', context = {}, maxIterations = 6, temperature = 0.1 }) {
  const apiKey = process.env.GROQ_API_KEY
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const iterations = []
  let stop = false
  for (let k = 1; k <= maxIterations && !stop; k++) {
    const messages = messagesForIteration({ equation, variable, context, prior: iterations })
    console.log('[schrodinger] iteration start', { k, model, temperature, apiUrl })
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature, max_tokens: 3500 }),
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
    const parsed = extractJSON(content)
    if (!parsed) {
      console.warn('[schrodinger] parse failed, stopping', { k })
      break
    }
    iterations.push({ ...parsed, k })
    if (parsed.stop === true) stop = true
    if (stop) console.log('[schrodinger] stop requested by model', { k })
  }

  const finalStep = iterations[iterations.length - 1] || {}
  const mainLatex = finalStep.main_result_latex || ''

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
  })

  return { iterations, latex, final: { main_result_latex: mainLatex } }
}
