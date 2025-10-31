import { solveSchrodingerIterative } from '../../lib/schrodinger/solver'
import { callLLM } from '../../lib/llm/provider'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { equation, variable, provider = 'groq' } = req.body || {}
  if (!equation || !equation.trim()) {
    return res.status(400).json({ error: 'Missing equation' })
  }

  // Auto-route physics/Hamiltonian style inputs to the dedicated Schrödinger solver
  const physicsLike = /(\bH\s*=|schro(e|ö)ding|psi|Ψ|\bV\(|ħ|\\hbar|wave\s*function|hamiltonian)/i.test(equation)
  if (physicsLike) {
    try {
      console.log('[api/solve] delegating to schrodinger solver')
      const result = await solveSchrodingerIterative({
        equation,
        variable: variable || 'x',
        context: {},
        maxIterations: 4,
        temperature: 0.1,
        provider,
      })
      return res.status(200).json({
        type: 'hamiltonian',
        steps: result.iterations?.map((it) => ({
          step: it.k,
          description: it.goal || `Iteration ${it.k}`,
          equation: it.equations?.[0]?.text || '',
          latex: it.equations?.[0]?.latex || '',
          explanation: it.analysis || it.result_summary || '',
        })) || [],
        finalSolution: 'See iterative derivation',
        finalSolutionLatex: result.final?.main_result_latex || 'See document',
        latexDocument: result.latex,
      })
    } catch (e) {
      console.error('[api/solve] schrodinger delegation failed', e)
      return res.status(500).json({ error: e?.message || 'Schrödinger solver failed' })
    }
  }

  try {
    const data = await callLLM({
      provider,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert mathematical solver. Solve equations step-by-step with extraordinary detail.\n- For cubic equations, explicitly use Cardano\'s method (depress the cubic, compute discriminant, derive casus irreducibilis handling).\n- For quartic, use Ferrari\'s method when symbolic solution is feasible.\n- For general polynomials: try factorization (rational root theorem, factoring by grouping), reduce to lower degrees if possible, and provide exact radicals when feasible; only mention numerical methods if exact form is provably not expressible with radicals.\n\nFor each solution, provide a JSON response with this EXACT structure:\n{\n  "type": "linear|quadratic|cubic|polynomial|hamiltonian|differential",\n  "steps": [\n    {\n      "step": 1,\n      "description": "Clear title",\n      "equation": "plain text equation",\n      "latex": "LaTeX formatted equation",\n      "explanation": "Detailed explanation of this step"\n    }\n  ],\n  "finalSolution": "plain text solution",\n  "finalSolutionLatex": "LaTeX formatted solution"\n}\n\nIMPORTANT: Return ONLY valid JSON, no other text.',
        },
        {
          role: 'user',
          content: `Solve this equation with detailed steps: ${equation}\nVariable: ${variable || 'x'}\n\nProvide the solution in the JSON format specified.`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      responseFormat: { type: 'json_object' },
    })

    const content = data.choices?.[0]?.message?.content || ''

    let parsed
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch (_) {}
    }

    if (!parsed) {
      parsed = {
        type: 'general',
        steps: [
          {
            step: 1,
            description: 'AI Analysis',
            equation: equation,
            latex: equation,
            explanation: content || 'No content returned',
          },
        ],
        finalSolution: 'See detailed explanation above',
        finalSolutionLatex: 'See detailed explanation above',
      }
    }

    return res.status(200).json(parsed)
  } catch (e) {
    console.error('[api/solve] error', e)
    return res.status(500).json({ error: `Failed to contact ${provider === 'openrouter' ? 'OpenRouter' : 'Groq'} API: ${e.message}` })
  }
}
