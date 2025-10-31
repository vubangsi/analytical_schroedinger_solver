export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { equation, variable } = req.body || {}
  if (!equation || !equation.trim()) {
    return res.status(400).json({ error: 'Missing equation' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: GROQ_API_KEY not set' })
  }
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
  const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert mathematical solver. Solve equations step-by-step with extraordinary detail.\n\nFor each solution, provide a JSON response with this EXACT structure:\n{\n  "type": "linear|quadratic|hamiltonian|differential",\n  "steps": [\n    {\n      "step": 1,\n      "description": "Clear title",\n      "equation": "plain text equation",\n      "latex": "LaTeX formatted equation",\n      "explanation": "Detailed explanation of this step"\n    }\n  ],\n  "finalSolution": "plain text solution",\n  "finalSolutionLatex": "LaTeX formatted solution"\n}\n\nIMPORTANT: Return ONLY valid JSON, no other text.',
          },
          {
            role: 'user',
            content: `Solve this equation with detailed steps: ${equation}\nVariable: ${variable || 'x'}\n\nProvide the solution in the JSON format specified.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: `API error: ${response.status}` })
    }

    const data = await response.json()
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
    return res.status(500).json({ error: 'Failed to contact Groq API' })
  }
}
