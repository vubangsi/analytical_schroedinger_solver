export async function planSchrodingerSolution({ apiUrl, apiKey, model, equation, context = {}, request }) {
  const messages = [
    { role: 'system', content: 'You are an expert planner for analytical solutions of Schrödinger/Hamiltonian problems. Output ONLY valid JSON. No prose.' },
    {
      role: 'user',
      content: `Create a rigorous step-by-step plan to solve the following quantum problem. Each step must be atomic and actionable, specify the method(s), expected equations to derive, and success criteria.\n\nEquation (if any): ${equation || '(not provided)'}\nContext: ${JSON.stringify(context)}\nRequest: ${request || '(not provided)'}\n\nReturn ONLY valid JSON with this schema:\n{\n  "plan": [\n    {\n      "index": 1,\n      "title": "...",\n      "methods": ["separation", "spectral", "variational", "perturbation", "WKB", "scattering", "Green"],\n      "deliverables": ["derive Sturm-Liouville form", "prove Hermiticity", "state domain & BCs", "normalize bound states", "compute E_n, ψ_n"],\n      "success": "Explicit condition describing when the step is accomplished"
      }\n  ],\n  "notes": "global remarks & assumptions"
}\n\nGuidelines:\n- Prefer exact methods first; then perturbation/variational if exact closed form is nontrivial.\n- Always include boundary-condition enforcement, normalization, and dimensional/Hermiticity checks.\n- Ensure plan length is between 4 and 8 steps.`,
    },
  ]

  const body = { model, messages, temperature: 0.1, max_tokens: 1200, response_format: { type: 'json_object' } }
  const resp = await fetch(apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!resp.ok) return { plan: [], notes: '' }
  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content || ''
  try { return JSON.parse(content) } catch { return { plan: [], notes: '' } }
}
