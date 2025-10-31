import { solveSchrodingerIterative } from '../../lib/schrodinger/solver'
import { parseSchrodingerIntent } from '../../lib/schrodinger/intent'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  let { equation, variable = 'x', context = {}, maxIterations = 6, temperature = 0.1, detailLevel = 'exhaustive', request: nlRequest } = req.body || {}
  if (!equation || !equation.trim()) {
    // Try to parse a natural-language request if provided
    const apiKey = process.env.GROQ_API_KEY
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
    const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
    if (nlRequest && apiKey) {
      const intent = await parseSchrodingerIntent({ request: nlRequest, apiUrl, apiKey, model })
      if (intent?.equation) {
        equation = intent.equation
        context = {
          ...context,
          type: intent.type || context.type,
          potential: intent.potential || context.potential,
          domain: intent.domain || context.domain,
          boundary: intent.boundary || context.boundary,
          initial: intent.initial || context.initial,
          parameters: intent.parameters || context.parameters,
          equationLatex: intent.equationLatex || context.equationLatex,
          task: intent.task || context.task,
          mass: intent.mass || context.mass,
        }
      }
    }
    if (!equation || !equation.trim()) {
      return res.status(400).json({ error: 'Missing equation' })
    }
  }

  try {
    console.log('[api/schrodinger] request', {
      hasKey: !!process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL,
      url: process.env.GROQ_API_URL,
      variable,
      maxIterations,
      temperature,
      detailLevel,
      ctxKeys: Object.keys(context || {}),
    })
    const maxItNum = Number.isFinite(Number(maxIterations)) ? Number(maxIterations) : 6
    const tempNum = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.1
    const clamped = Math.max(1, Math.min(maxItNum, 4)) // Vercel Hobby timeout friendly
    const t = Math.max(0, Math.min(tempNum, 1))

    const result = await solveSchrodingerIterative({ equation, variable, context, maxIterations: clamped, temperature: t, detailLevel })
    console.log('[api/schrodinger] success', { iterations: result?.iterations?.length || 0, latexLen: result?.latex?.length || 0 })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[api/schrodinger] error', { message: e?.message, stack: e?.stack })
    const message = e?.message || 'Failed to solve Schrödinger equation'
    return res.status(500).json({ error: message })
  }
}
