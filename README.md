# AI Equation Solver

An AI-powered equation solver with extraordinary detail and consistency, powered by Groq AI.

## Features
- Solve linear, quadratic, Hamiltonian, and complex equations
- Step-by-step solutions with detailed explanations
- LaTeX output for academic papers
- Download solutions as .tex files
- Beautiful, responsive UI

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

## Schrödinger Solver API

- Endpoint: `POST /api/schrodinger`
- Env vars (required):
  - `GROQ_API_KEY`
- Optional env vars:
  - `GROQ_MODEL` (default: `openai/gpt-oss-20b`)
  - `GROQ_API_URL` (default: `https://api.groq.com/openai/v1/chat/completions`)

Request body JSON:

```json
{
  "equation": "- (ħ^2 / 2m) d^2ψ/dx^2 + V(x) ψ = E ψ",
  "variable": "x",
  "maxIterations": 6,
  "temperature": 0.1,
  "context": {
    "type": "time-independent",
    "potential": "Harmonic oscillator V(x)=1/2 m ω^2 x^2",
    "domain": "x ∈ (−∞,∞)",
    "boundary": "ψ → 0 as |x|→∞",
    "equationLatex": "-\\frac{\\hbar^2}{2m} \\frac{d^2\\psi}{dx^2} + V(x)\\psi = E\\psi",
    "assumptions": ["Non-relativistic", "Bound states"],
    "notation": ["\\psi(x): wavefunction", "E: energy eigenvalue"]
  }
}
```

Returns JSON with `iterations` and a compiled `latex` document string you can save as `.tex`.

Example curl:

```bash
curl -X POST http://localhost:3000/api/schrodinger \
  -H 'Content-Type: application/json' \
  -d '{
    "equation": "- (ħ^2 / 2m) d^2ψ/dx^2 + 1/2 m ω^2 x^2 ψ = E ψ",
    "variable": "x"
  }'
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push to GitHub
2. Import to Vercel
3. Set Environment Variables (Project Settings → Environment Variables):
   - `GROQ_API_KEY` (Required)
   - `GROQ_MODEL` (Optional, default: `openai/gpt-oss-20b`)
   - `GROQ_API_URL` (Optional, default: `https://api.groq.com/openai/v1/chat/completions`)
4. Build & Deploy

Notes:
- The Schrödinger endpoint clamps `maxIterations` to 4 for Hobby plan timeouts.
- Next.js will build with default settings: `npm install`, `next build`, `next start`.
- If needed, set the Node.js version to 18+ in Vercel Project → Settings → General.

## Tech Stack
- Next.js 14
- React 18
- Tailwind CSS
- Groq AI API
- Lucide Icons