export async function parseSchrodingerIntent({ request, apiUrl, apiKey, model }) {
  if (!request || !request.trim()) return null
  const messages = [
    {
      role: 'system',
      content:
        'You extract physics problem intent for Schrödinger/Hamiltonian systems. Output ONLY valid JSON matching the schema. No prose.',
    },
    {
      role: 'user',
      content: `From the following natural-language request, extract structured fields needed to solve a Schrödinger/Hamiltonian problem. If a field is unknown, omit it. Return ONLY valid JSON with keys:\n{\n  "equation": string, // canonical target equation statement or Hamiltonian expression (plain text)\n  "equationLatex"?: string,\n  "type"?: "time-independent"|"time-dependent",\n  "potential"?: string,\n  "mass"?: string, // position-dependent mass if any\n  "domain"?: string,\n  "boundary"?: string,\n  "initial"?: string,\n  "parameters"?: string,\n  "task"?: string // e.g., "eigenvalues and eigenfunctions", "time evolution", etc.\n}\n\nRequest: ${request}`,
    },
  ]

  const body = {
    model,
    messages,
    temperature: 0.0,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  }

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content || ''
  try {
    const parsed = JSON.parse(content)
    return parsed
  } catch (_) {
    return null
  }
}
