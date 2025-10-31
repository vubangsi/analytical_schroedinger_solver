import { solveSchrodingerIterative } from '../../lib/schrodinger/solver'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { equation, variable = 'x', context = {}, maxIterations = 6, temperature = 0.1 } = req.body || {}
  if (!equation || !equation.trim()) {
    return res.status(400).json({ error: 'Missing equation' })
  }

  try {
    const maxItNum = Number.isFinite(Number(maxIterations)) ? Number(maxIterations) : 6
    const tempNum = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.1
    const clamped = Math.max(1, Math.min(maxItNum, 4)) // Vercel Hobby timeout friendly
    const t = Math.max(0, Math.min(tempNum, 1))

    const result = await solveSchrodingerIterative({ equation, variable, context, maxIterations: clamped, temperature: t })
    return res.status(200).json(result)
  } catch (e) {
    const message = e?.message || 'Failed to solve Schrödinger equation'
    return res.status(500).json({ error: message })
  }
}
