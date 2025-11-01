// Test script for PDM Quartic problem
import fetch from 'node-fetch';

const testPDMProblem = async () => {
  console.log('🧪 Testing PDM Quartic Problem End-to-End\n');
  
  const payload = {
    mode: 'schrodinger',
    provider: 'nvidia', // Using NVIDIA NIM
    requestText: 'Solve the Schrödinger equation for a system with effective mass of the form m(x)=m₀(1+gx) in a linear potential V(x) = cx. Determine the eigenfunctions and energy spectrum.',
    variable: 'x',
    maxIterations: 4,
    temperature: 0.1,
    detailLevel: 'exhaustive',
    strategy: 'planner',
    context: {
      type: 'Position-dependent mass with linear potential',
      mass: 'm(x) = m₀(1 + gx)',
      potential: 'V(x) = cx',
      domain: 'x ∈ [0, ∞)',
      boundary: 'ψ(0) = 0, ψ(∞) = 0',
      task: 'Find eigenfunctions ψ(x) and energy eigenvalues E'
    }
  };

  console.log('📤 Sending request to /api/solve...');
  console.log('Provider:', payload.provider);
  console.log('Max Iterations:', payload.maxIterations);
  console.log('Detail Level:', payload.detailLevel);
  console.log('Strategy:', payload.strategy);
  console.log('\n');

  try {
    const response = await fetch('http://localhost:3000/api/solve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error Response:', response.status);
      console.error('Error:', data.error || data);
      return;
    }

    console.log('✅ Success! Response received\n');
    console.log('📊 Results:');
    console.log('- Iterations:', data.iterations?.length || 0);
    console.log('- Total Equations:', data.iterations?.reduce((sum, it) => sum + (it.equations?.length || 0), 0) || 0);
    console.log('- LaTeX Length:', data.latex?.length || 0, 'characters');
    console.log('- Main Result:', data.mainResult?.substring(0, 100) || 'N/A');
    
    if (data.iterations && data.iterations.length > 0) {
      console.log('\n📝 Iteration Summary:');
      data.iterations.forEach((it, i) => {
        console.log(`  [${i + 1}] ${it.goal || 'N/A'}`);
        console.log(`      Equations: ${it.equations?.length || 0}`);
        console.log(`      Summary: ${(it.result_summary || '').substring(0, 80)}...`);
      });
    }

    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
};

// Run the test
testPDMProblem();

