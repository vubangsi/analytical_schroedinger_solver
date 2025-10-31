export async function planSchrodingerSolution({ apiUrl, apiKey, model, equation, context = {}, request, extraHeaders = {} }) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert theoretical physicist planning analytical solutions to Schrödinger/Hamiltonian problems at the level of Landau & Lifshitz or Sakurai.

Your plan must be:
1. COMPREHENSIVE: Cover all necessary steps from problem formulation to final solution
2. GRANULAR: Each step should be atomic and produce 10-15 equations
3. METHODICAL: Specify exact mathematical methods and physics principles
4. RIGOROUS: Include all verification steps (Hermiticity, normalization, boundary conditions, dimensional analysis)
5. NON-REDUNDANT: Each step builds on previous without repetition

Output ONLY valid JSON. No prose.`
    },
    {
      role: 'user',
      content: `Create a detailed, expert-level plan to solve this quantum mechanics problem with extraordinary rigor and granularity.

PROBLEM:
Equation: ${equation || '(not provided)'}
Context: ${JSON.stringify(context, null, 2)}
Task: ${request || context?.task || '(not provided)'}

PLANNING REQUIREMENTS:

1. STRUCTURE (4-6 major steps):
   - Step 1: Problem formulation and setup
   - Steps 2-4: Core derivation using appropriate methods
   - Step 5: Verification and physical interpretation
   - Step 6 (if needed): Special cases or extensions

2. For EACH step, specify:
   - Clear, specific title
   - Exact methods to use (be specific, not generic)
   - Detailed deliverables (10-15 equations expected)
   - Concrete success criterion
   - Expected physics checks

3. METHODS (choose appropriate ones):
   - Separation of variables (specify coordinates)
   - Spectral decomposition (specify basis)
   - Sturm-Liouville theory
   - WKB approximation (specify regime)
   - Perturbation theory (specify order and parameter)
   - Variational method (specify trial function)
   - Green's function (specify boundary conditions)
   - Scattering theory (specify asymptotic form)
   - Operator methods (ladder operators, etc.)

4. MANDATORY DELIVERABLES across all steps:
   - Hamiltonian operator in appropriate representation
   - Eigenvalue equation derivation
   - Boundary condition enforcement
   - Normalization constant calculation
   - Hermiticity verification
   - Dimensional analysis
   - Orthogonality proof
   - Energy spectrum derivation
   - Wavefunction explicit form
   - Physical interpretation

5. QUALITY STANDARDS:
   - Each step should produce substantial mathematical content
   - No vague statements like "solve the equation"
   - Specify what approximations are valid and why
   - Include error estimates for approximate methods
   - State regimes of validity

OUTPUT SCHEMA:
{
  "plan": [
    {
      "index": 1,
      "title": "Specific, clear title (e.g., 'Formulate eigenvalue problem and establish Sturm-Liouville form')",
      "methods": ["specific method 1", "specific method 2"],
      "deliverables": [
        "Derive Hamiltonian operator in position representation",
        "Formulate time-independent Schrödinger equation",
        "Identify Sturm-Liouville form with weight function",
        "State domain and boundary conditions explicitly",
        "Verify Hermiticity by integration by parts",
        "Perform dimensional analysis of all terms",
        ...
      ],
      "success": "Concrete, measurable criterion (e.g., 'Eigenvalue equation in standard form with verified Hermiticity and stated boundary conditions')",
      "physics_checks": ["Hermiticity", "Dimensional consistency", "Boundary conditions"]
    },
    ...
  ],
  "notes": "Global assumptions, approximations, and strategy overview",
  "expected_total_equations": 50-80
}

Create a plan with 4-6 steps that will produce a complete, rigorous solution.`,
    },
  ]

  const body = { model, messages, temperature: 0.1, max_tokens: 2000, response_format: { type: 'json_object' } }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  }
  const resp = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!resp.ok) return { plan: [], notes: '' }
  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content || ''
  try { return JSON.parse(content) } catch { return { plan: [], notes: '' } }
}
