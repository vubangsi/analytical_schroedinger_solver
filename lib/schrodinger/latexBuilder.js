function esc(s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([#%&_$~^])/g, '\\$1')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

function section(title) {
  return `\\section{${esc(title || '')}}\n`
}

export function buildLatexDocument(meta = {}, iterations = [], final = {}) {
  const title = meta.title || 'Iterative Solution of the Schr\\"odinger Equation'
  const author = meta.author || 'AutoSolver'
  const abstract = meta.abstract || ''
  const problem = meta.problem || ''
  const assumptions = Array.isArray(meta.assumptions) ? meta.assumptions : []
  const notation = Array.isArray(meta.notation) ? meta.notation : []

  const preamble = `\n\\documentclass[11pt]{article}\n\\usepackage{amsmath, amssymb, amsthm, physics, bm}\n\\usepackage{mathtools}\n\\usepackage{geometry}\n\\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}\n\\geometry{margin=1in}\n\\title{${esc(title)}}\n\\author{${esc(author)}}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\tableofcontents\\newpage\n`

  const abstractBlock = abstract ? `\\begin{abstract}\n${esc(abstract)}\n\\end{abstract}\n` : ''

  let body = ''
  body += section('Problem Statement')
  if (problem) body += `${esc(problem)}\n\n`
  if (meta.equationLatex) body += `Given: $${meta.equationLatex}$.\\\n\n`

  if (assumptions.length) {
    body += section('Assumptions and Approximations')
    body += assumptions.map((a) => `\\noindent ${esc(a)}\\\n`).join('') + '\n'
  }

  if (notation.length) {
    body += section('Notation')
    body += notation.map((n) => `\\noindent ${esc(n)}\\\n`).join('') + '\n'
  }

  body += section('Iterative Solution Procedure')
  iterations.forEach((it, idx) => {
    const k = it.k || idx + 1
    body += `\\subsection{Iteration ${k}}\n`
    if (it.goal) body += `\\textbf{Goal:} ${esc(it.goal)}\\\n\n`
    if (it.analysis) body += `${esc(it.analysis)}\\\n\n`
    if (Array.isArray(it.equations) && it.equations.length) {
      it.equations.forEach((eq) => {
        if (eq.latex) body += `\\begin{equation}\n${eq.latex}\n\\end{equation}\n`
        if (eq.text) body += `${esc(eq.text)}\\\n\n`
      })
    }
    if (it.latex) body += `${it.latex}\n`
    if (it.result_summary) body += `\\textit{Summary:} ${esc(it.result_summary)}\\\n\n`
  })

  body += section('Conclusion')
  if (final.text) body += `${esc(final.text)}\\\n\n`
  if (final.main_result_latex) body += `\\begin{equation}\n${final.main_result_latex}\n\\end{equation}\n`

  const end = '\n\\end{document}\n'
  return preamble + abstractBlock + body + end
}
