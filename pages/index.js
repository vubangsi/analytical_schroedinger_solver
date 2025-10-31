import React, { useState } from 'react';
import { Calculator, Loader2, Download, Copy, CheckCircle2 } from 'lucide-react';
import Head from 'next/head';

export default function Home() {
  const [equation, setEquation] = useState('');
  const [variable, setVariable] = useState('x');
  const [mode, setMode] = useState('general'); // 'general' | 'schrodinger'
  const [provider, setProvider] = useState('groq'); // 'groq' | 'openrouter'
  // Schrödinger context
  const [schType, setSchType] = useState('time-independent');
  const [requestText, setRequestText] = useState('');
  const [strategy, setStrategy] = useState('planner'); // 'planner' | 'baseline'
  const [potential, setPotential] = useState('');
  const [domain, setDomain] = useState('');
  const [boundary, setBoundary] = useState('');
  const [initialCond, setInitialCond] = useState('');
  const [parameters, setParameters] = useState('');
  const [equationLatex, setEquationLatex] = useState('');
  const [maxIterations, setMaxIterations] = useState(4);
  const [temperature, setTemperature] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // general solver result
  const [schResult, setSchResult] = useState(null); // schrodinger solver result
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const solveEquation = async () => {
    if (!equation.trim()) {
      setError('Please enter an equation');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setSchResult(null);

    try {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ equation, variable, provider }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `API error: ${response.status}`);
      }

      const parsedResult = await response.json();
      setResult(parsedResult);
    } catch (err) {
      setError(err.message || 'Failed to solve equation. Please try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const solveSchrodinger = async () => {
    if (!equation.trim() && !requestText.trim()) {
      setError('Provide either an equation/Hamiltonian or a natural-language request.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setSchResult(null);

    try {
      const context = {
        type: schType || undefined,
        potential: potential || undefined,
        domain: domain || undefined,
        boundary: boundary || undefined,
        initial: initialCond || undefined,
        parameters: parameters || undefined,
        equationLatex: equationLatex || undefined,
      };
      const response = await fetch('/api/schrodinger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equation,
          variable,
          context,
          maxIterations: Number(maxIterations) || 4,
          temperature: Number(temperature) || 0.1,
          detailLevel: 'exhaustive',
          request: requestText || undefined,
          strategy,
          provider,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `API error: ${response.status}`);
      }

      const parsed = await response.json();
      setSchResult(parsed);
    } catch (err) {
      setError(err.message || 'Failed to solve Schrödinger equation. Please try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyLatex = () => {
    if (mode === 'schrodinger' && schResult?.latex) {
      navigator.clipboard.writeText(schResult.latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    if (!result) return;
    const latexDoc = generateFullLatex();
    navigator.clipboard.writeText(latexDoc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLatex = () => {
    if (mode === 'schrodinger' && schResult?.latex) {
      const blob = new Blob([schResult.latex], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schrodinger_solution.tex';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!result) return;
    const latexDoc = generateFullLatex();
    const blob = new Blob([latexDoc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution.tex';
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateFullLatex = () => {
    if (!result) return '';

    let doc = `\\documentclass[12pt]{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{Analytical Solution}
\\author{AI-Powered Equation Solver}
\\date{\\today}

\\begin{document}
\\maketitle

\\section*{Problem Statement}
\\begin{equation}
${result.steps[0]?.latex || equation}
\\end{equation}

\\section*{Solution Type: ${result.type}}

\\section*{Detailed Solution Process}

`;

    result.steps.forEach((step, idx) => {
      if (idx > 0) {
        doc += `\\subsection*{Step ${step.step}: ${step.description}}
${step.explanation}
\\begin{equation}
${step.latex}
\\end{equation}

`;
      }
    });

    doc += `\\section*{Final Solution}
\\begin{equation}
\\boxed{${result.finalSolutionLatex}}
\\end{equation}

\\end{document}`;

    return doc;
  };

  const examples = [
    { label: 'Linear', eq: '2*x + 5 = 13' },
    { label: 'Quadratic', eq: 'x^2 - 5*x + 6 = 0' },
    { label: 'Hamiltonian', eq: 'H = p^2/(2m) + kx^2/2' },
    { label: 'Cubic', eq: 'x^3 - 6x^2 + 11x - 6 = 0' },
    { label: 'PDM Quartic (NL)', eq: '', req: 'Determine the eigenvalues and eigenfunctions of the quartic oscillator with exponentially decreasing mass m(x)=m0(1+e^{-g x}).' }
  ];

  return (
    <>
      <Head>
        <title>AI Equation Solver - Powered by AI</title>
        <meta name="description" content="Solve equations with AI-powered extraordinary detail" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg">
                <Calculator className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">AI Equation Solver</h1>
                <p className="text-gray-600 text-sm">Powered by {provider === 'groq' ? 'Groq AI' : 'OpenRouter'} - Extraordinary Detail & Consistency</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-2xl font-bold text-gray-900">Enter Your Equation</h2>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setMode('general')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium ${mode==='general' ? 'bg-white shadow border border-gray-200' : 'text-gray-600'}`}
                >General</button>
                <button
                  onClick={() => setMode('schrodinger')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium ${mode==='schrodinger' ? 'bg-white shadow border border-gray-200' : 'text-gray-600'}`}
                >Schrödinger</button>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Equation
                </label>
                <input
                  type="text"
                  value={equation}
                  onChange={(e) => setEquation(e.target.value)}
                  placeholder="e.g., x^2 - 5*x + 6 = 0"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg font-mono"
                  onKeyPress={(e) => e.key === 'Enter' && (mode==='general' ? solveEquation() : solveSchrodinger())}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Variable
                  </label>
                  <input
                    type="text"
                    value={variable}
                    onChange={(e) => setVariable(e.target.value)}
                    placeholder="x"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    LLM Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg bg-white"
                  >
                    <option value="groq">Groq (Fast & Efficient)</option>
                    <option value="openrouter">OpenRouter (Advanced Models)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {provider === 'groq'
                      ? 'Fast responses, good for standard problems'
                      : 'Advanced models (GPT-4, Claude), best for complex derivations'}
                  </p>
                </div>
              </div>

              {mode === 'schrodinger' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Describe your problem (optional)</label>
                    <textarea value={requestText} onChange={(e)=>setRequestText(e.target.value)} placeholder="e.g., Determine the eigenvalues and eigenfunctions of the quartic oscillator with exponentially decreasing mass m(x)=m0(1+e^{-g x})." className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm min-h-[90px]" />
                    <p className="mt-1 text-xs text-gray-500">If provided, the solver will infer equation, potential, mass profile, and task from your description.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Strategy</label>
                    <select
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                    >
                      <option value="planner">Planner (structured, multi-step)</option>
                      <option value="baseline">Baseline (direct iterative)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                    <select
                      value={schType}
                      onChange={(e) => setSchType(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                    >
                      <option value="time-independent">Time-Independent</option>
                      <option value="time-dependent">Time-Dependent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Potential</label>
                    <input value={potential} onChange={(e)=>setPotential(e.target.value)} placeholder="e.g., 1/2 m ω^2 x^2" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Domain</label>
                    <input value={domain} onChange={(e)=>setDomain(e.target.value)} placeholder="e.g., x ∈ (−∞, ∞)" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Boundary Conditions</label>
                    <input value={boundary} onChange={(e)=>setBoundary(e.target.value)} placeholder="e.g., ψ→0 as |x|→∞" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Initial Condition (optional)</label>
                    <input value={initialCond} onChange={(e)=>setInitialCond(e.target.value)} placeholder="ψ(x,0)=..." className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Parameters (optional)</label>
                    <input value={parameters} onChange={(e)=>setParameters(e.target.value)} placeholder="m, ω, ħ constants..." className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Equation LaTeX (optional)</label>
                    <input value={equationLatex} onChange={(e)=>setEquationLatex(e.target.value)} placeholder="-\\frac{\\hbar^2}{2m} \\frac{d^2\\psi}{dx^2} + V(x)\\psi = E\\psi" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Max Iterations</label>
                    <input type="number" min="1" max="10" value={maxIterations} onChange={(e)=>setMaxIterations(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature</label>
                    <input type="number" step="0.05" min="0" max="1" value={temperature} onChange={(e)=>setTemperature(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Quick Examples:</p>
                <div className="flex flex-wrap gap-2">
                  {examples.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => { setEquation(ex.eq || ''); if (ex.req) setRequestText(ex.req); }}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={mode==='general' ? solveEquation : solveSchrodinger}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {mode==='general' ? 'Solving...' : 'Solving Schrödinger...'}
                  </>
                ) : (
                  <>
                    <Calculator size={20} />
                    {mode==='general' ? 'Solve Equation' : 'Solve Schrödinger'}
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                {error}
              </div>
            )}
          </div>

          {mode==='general' && result && (
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Solution</h2>
                <div className="flex gap-2">
                  <button
                    onClick={copyLatex}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                    {copied ? 'Copied!' : 'Copy LaTeX'}
                  </button>
                  <button
                    onClick={downloadLatex}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Download size={18} />
                    Download .tex
                  </button>
                </div>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-900 mb-1">Equation Type</p>
                <p className="text-lg font-mono text-blue-700 capitalize">{result.type}</p>
              </div>

              <div className="space-y-6">
                {result.steps.map((step, idx) => (
                  <div key={idx} className="border-l-4 border-indigo-500 pl-6 py-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{step.description}</h3>
                        <div className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200">
                          <p className="font-mono text-gray-800">{step.equation}</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200">
                          <p className="text-sm font-semibold text-blue-900 mb-1">LaTeX:</p>
                          <code className="text-xs text-blue-700 break-all">{step.latex}</code>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{step.explanation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl">
                <h3 className="text-xl font-bold text-green-900 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="text-green-600" />
                  Final Solution
                </h3>
                <div className="bg-white rounded-lg p-4 mb-3 border border-green-200">
                  <p className="font-mono text-lg text-gray-900">{result.finalSolution}</p>
                </div>
                <div className="bg-green-100 rounded-lg p-4 border border-green-300">
                  <p className="text-sm font-semibold text-green-900 mb-1">LaTeX:</p>
                  <code className="text-sm text-green-800 break-all">{result.finalSolutionLatex}</code>
                </div>
              </div>
            </div>
          )}

          {mode==='schrodinger' && schResult && (
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Schrödinger Solution</h2>
                <div className="flex gap-2">
                  <button
                    onClick={copyLatex}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                    {copied ? 'Copied!' : 'Copy LaTeX'}
                  </button>
                  <button
                    onClick={downloadLatex}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Download size={18} />
                    Download .tex
                  </button>
                </div>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-900 mb-1">Iterations</p>
                <p className="text-lg font-mono text-blue-700">{schResult.iterations?.length || 0} steps</p>
              </div>

              <div className="space-y-6">
                {schResult.iterations?.map((it, idx) => (
                  <div key={idx} className="border-l-4 border-indigo-500 pl-6 py-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {it.k || (idx + 1)}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{it.goal || `Iteration ${it.k || (idx + 1)}`}</h3>
                        {Array.isArray(it.equations) && it.equations.map((eq, j) => (
                          <div key={j} className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200">
                            {eq.text && <p className="font-mono text-gray-800 mb-2">{eq.text}</p>}
                            {eq.latex && (
                              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                <p className="text-sm font-semibold text-blue-900 mb-1">LaTeX:</p>
                                <code className="text-xs text-blue-700 break-all">{eq.latex}</code>
                              </div>
                            )}
                          </div>
                        ))}
                        {it.analysis && <p className="text-gray-700 leading-relaxed">{it.analysis}</p>}
                        {it.result_summary && (
                          <div className="mt-2 text-sm text-gray-600"><strong>Summary:</strong> {it.result_summary}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-gray-600">
          <p className="text-sm">
            Built with Next.js + Groq AI • Deploy to Vercel
          </p>
        </div>
      </div>
    </>
  );
}