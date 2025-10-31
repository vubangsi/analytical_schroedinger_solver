# AI Equation Solver

An AI-powered equation solver with **extraordinary detail and consistency**, producing expert-level solutions comparable to theoretical physicists like Einstein, Dirac, or Feynman.

## 🌟 Key Features

### Dual LLM Provider Support
- **Groq**: Fast, efficient for standard problems
- **OpenRouter**: Advanced models (GPT-4, Claude, etc.) for maximum rigor

### Expert-Level Solutions
- **50-80+ equations** per complete derivation
- **Equation-by-equation exposition** with explicit justifications
- **Zero redundancy** - every equation advances the solution
- **Perfect consistency** - rigorous notation and symbol tracking
- **Complete verification** - all physics checks explicitly shown

### Solver Modes
- **General**: Linear, quadratic, cubic, polynomial equations
- **Schrödinger**: Quantum mechanics problems with advanced analytical methods

### Output Quality
- Step-by-step solutions with detailed explanations
- Professional LaTeX output for academic papers
- Download solutions as .tex files
- Beautiful, responsive UI with provider selection

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env.local` with your API keys:
```env
# Groq Configuration
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b

# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o
OPENROUTER_SITE_URL=https://your-site.com
OPENROUTER_SITE_TITLE=AI Equation Solver
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Open Application
Navigate to [http://localhost:3000](http://localhost:3000)

## 📚 Documentation

- **[USAGE_GUIDE.md](USAGE_GUIDE.md)**: Complete user guide with examples
- **[SOLVER_ENHANCEMENTS.md](SOLVER_ENHANCEMENTS.md)**: Technical details of enhancements

## 🔬 Schrödinger Solver API

### Endpoint
`POST /api/schrodinger`

### Request Body
```json
{
  "equation": "- (ℏ^2 / 2m) d^2ψ/dx^2 + V(x)ψ = Eψ",
  "variable": "x",
  "provider": "groq",
  "context": {
    "type": "time-independent",
    "potential": "Harmonic oscillator V(x)=1/2 m ω^2 x^2",
    "domain": "x ∈ (-∞, ∞)",
    "boundary": "ψ → 0 as |x| → ∞"
  },
  "maxIterations": 4,
  "temperature": 0.1,
  "strategy": "planner"
}
```

### Environment Variables
- **Required**: `GROQ_API_KEY` or `OPENROUTER_API_KEY`
- **Optional**:
  - `GROQ_MODEL` (default: `openai/gpt-oss-20b`)
  - `OPENROUTER_MODEL` (default: `openai/gpt-4o`)
  - `OPENROUTER_SITE_URL`
  - `OPENROUTER_SITE_TITLE`

### Response
Returns JSON with:
- `iterations`: Array of detailed derivation steps (10-15 equations each)
- `latex`: Complete LaTeX document ready for compilation
- `final`: Main result and metadata

### Example cURL
```bash
curl -X POST http://localhost:3000/api/schrodinger \
  -H 'Content-Type: application/json' \
  -d '{
    "equation": "- (ℏ^2 / 2m) d^2ψ/dx^2 + 1/2 m ω^2 x^2 ψ = E ψ",
    "variable": "x",
    "provider": "openrouter",
    "maxIterations": 4,
    "strategy": "planner"
  }'
```

## 🎯 Example Problems

### Harmonic Oscillator
```
Equation: - (ℏ^2 / 2m) d^2ψ/dx^2 + (1/2) m ω^2 x^2 ψ = E ψ
Expected: E_n = ℏω(n + 1/2), Hermite polynomials
Output: ~50-60 equations with complete derivation
```

### Infinite Square Well
```
Equation: - (ℏ^2 / 2m) d^2ψ/dx^2 = E ψ (0 < x < L)
Expected: E_n = n²π²ℏ²/(2mL²), sin(nπx/L)
Output: ~40-50 equations with normalization
```

### Position-Dependent Mass (Advanced)
```
Natural Language: "Determine eigenvalues and eigenfunctions of the
quartic oscillator with exponentially decreasing mass m(x)=m₀(1+e^{-gx})"
Expected: WKB approximation, turning point analysis
Output: ~60-80 equations with regime validity
```

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Deployment Steps
1. Push to GitHub
2. Import to Vercel
3. Set Environment Variables (Project Settings → Environment Variables):
   ```
   GROQ_API_KEY=your_groq_key
   GROQ_MODEL=openai/gpt-oss-20b
   OPENROUTER_API_KEY=your_openrouter_key
   OPENROUTER_MODEL=openai/gpt-4o
   OPENROUTER_SITE_URL=https://your-app.vercel.app
   OPENROUTER_SITE_TITLE=AI Equation Solver
   ```
4. Build & Deploy

### Notes
- Schrödinger endpoint clamps `maxIterations` to 4 for Hobby plan timeouts
- Node.js 18+ recommended (set in Vercel Project → Settings → General)
- For production, consider Pro plan for longer timeouts

## 🛠️ Tech Stack
- **Framework**: Next.js 14
- **UI**: React 18, Tailwind CSS, Lucide Icons
- **LLM Providers**: Groq, OpenRouter
- **Output**: LaTeX generation, PDF-ready documents

## 📊 Quality Metrics

### What Makes This Solver Unique

#### Traditional Solvers:
- ❌ Skip algebraic steps
- ❌ Vague explanations
- ❌ Missing verifications
- ❌ Inconsistent notation
- ❌ 5-10 equations total

#### This Solver:
- ✅ Every step shown explicitly
- ✅ Physical principles stated
- ✅ All checks verified
- ✅ Perfect consistency
- ✅ **50-80+ equations** per problem

### Validation System
- **9 quality checks** per iteration
- **Automatic revision** for substandard output
- **Cross-iteration consistency** tracking
- **Physics rigor** enforcement
- **Mathematical completeness** verification

## 🎓 Use Cases

- **Students**: Learn quantum mechanics with complete derivations
- **Researchers**: Generate publication-quality solutions
- **Educators**: Create detailed problem solutions
- **Engineers**: Verify analytical calculations
- **Physicists**: Explore novel quantum systems

## 📝 License

MIT License - feel free to use for academic or commercial purposes

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Additional quantum systems (spin, angular momentum)
- Relativistic equations (Klein-Gordon, Dirac)
- Time-dependent solutions
- Numerical verification
- Interactive visualizations

## ⚡ Performance

### Groq
- Speed: 5-15 seconds per iteration
- Cost: ~$0.01 per problem
- Quality: Excellent for standard problems

### OpenRouter (GPT-4)
- Speed: 30-60 seconds per iteration
- Cost: ~$0.10-0.50 per problem
- Quality: Research-level rigor

---

**Built with ❤️ for the physics community**

*Producing solutions worthy of Einstein, one equation at a time.*