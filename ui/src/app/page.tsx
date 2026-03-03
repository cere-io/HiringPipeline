'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [candidateId, setCandidateId] = useState('');
  const [role, setRole] = useState('Principal Software Engineer');
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  
  // Advanced logging state
  const [terminalLogs, setTerminalLogs] = useState<{time: string, type: 'network'|'agent'|'cubby'|'system', message: string}[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [roles, setRoles] = useState<string[]>(['Principal Software Engineer', 'AI Innovator']);
  const [activeStep, setActiveStep] = useState(1);
  const [latestCandidate, setLatestCandidate] = useState<string | null>(null);
  const [isDistilling, setIsDistilling] = useState(false);

  const addLog = (type: 'network'|'agent'|'cubby'|'system', message: string) => {
    setTerminalLogs(prev => [...prev, { time: new Date().toISOString().split('T')[1].slice(0, -1), type, message }]);
  };

  const fetchData = async () => {
    const res = await fetch('/api/data');
    const json = await res.json();
    setData(json);
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/notion/roles');
      const json = await res.json();
      if (json.roles && json.roles.length > 0) {
        setRoles(json.roles);
        setRole(json.roles[0]); 
      }
    } catch (e) {
      console.error("Failed to load dynamic roles");
    }
  };

  useEffect(() => {
    fetchData();
    fetchRoles();
    addLog('system', 'UI Initialized. Connecting to mock DDC Event Runtime...');
    addLog('network', 'GET /api/data - Fetching initial Cubby states');
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActiveStep(2); // Move to processing step
    
    addLog('system', `Webhook received from ATS. Simulating NEW_APPLICATION event for ${candidateId}`);
    addLog('network', `POST /api/pipeline - Payload: { candidateId: "${candidateId}", role: "${role}" }`);

    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, role, resumeText, source: candidateId.split('-')[0] || 'direct' })
    });
    
    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }
    
    if (result.traits) {
      addLog('cubby', `[WRITE] hiring-traits/${candidateId} = ${JSON.stringify(result.traits)}`);
    }
    if (result.score) {
      addLog('cubby', `[WRITE] hiring-scores/${candidateId} = ${JSON.stringify(result.score)}`);
    }

    await fetchData();
    setLatestCandidate(candidateId);
    setLoading(false);
    setActiveStep(3); // Move to review step
    setCandidateId('');
    setResumeText('');
  };

  const handleInterview = async (cid: string, cRole: string) => {
    const mockTranscript = `Interviewer: Tell me about a time you designed a scalable architecture.
Candidate: At my last job, I designed a microservices architecture using Node.js and Redis that scaled to 10M DAU. We had to carefully manage our Cubby state...
Interviewer: How do you handle disagreements on technical choices?
Candidate: I try to be very clear in my communication and rely on data-driven ADRs to make decisions.`;

    addLog('system', `Email Poller Webhook simulated. Ingesting Interview Transcript for ${cid}`);
    addLog('network', `POST /api/webhooks/interview - Payload: { candidateId: "${cid}", transcriptLength: ${mockTranscript.length} }`);
    
    const res = await fetch('/api/webhooks/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, transcriptText: mockTranscript })
    });
    
    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }
    
    if (result.analysis) {
      addLog('cubby', `[WRITE] hiring-interviews/${cid} = ${JSON.stringify(result.analysis)}`);
    }

    await fetchData();
    setActiveStep(5); // Proceed to Distill step
  };

  const handleOutcome = async (cid: string, cRole: string, outcome: number) => {
    addLog('system', `Notion Webhook simulated. Human Score: ${outcome}/10 for ${cid}`);
    addLog('network', `POST /api/distill - Payload: { candidateId: "${cid}", outcome: ${outcome} }`);
    
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome, source: cid.split('-')[0] || 'direct', isPerformanceReview: false })
    });

    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }
    
    // Every distillation call writes to 3 cubbies
    addLog('cubby', `[WRITE] hiring-outcomes/${cid} = { outcome: ${outcome}, timestamp: "${new Date().toISOString()}" }`);
    addLog('cubby', `[WRITE] hiring-traits/${cid} → human_feedback_score: ${outcome}`);
    if (result.new_weights) {
      addLog('cubby', `[WRITE] hiring-meta/trait_weights/${cRole} = ${JSON.stringify(result.new_weights)}`);
      addLog('system', `Compound Intelligence cycle complete. Weights updated for ${cRole}.`);
    }

    await fetchData();
    setActiveStep(4); // Proceed to Interview step
  };

  const handleDistill = async (cid: string, cRole: string, performanceScore: number) => {
    if (isDistilling) return;
    setIsDistilling(true);
    addLog('system', `⏩ 1 Month Later — Performance Review triggered for ${cid}`);
    addLog('network', `POST /api/distill - Payload: { candidateId: "${cid}", outcome: ${performanceScore} }`);
    
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome: performanceScore, source: cid.split('-')[0] || 'direct', isPerformanceReview: true })
    });

    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }

    addLog('cubby', `[WRITE] hiring-outcomes/${cid} = { outcome: ${performanceScore}, timestamp: "${new Date().toISOString()}" }`);
    addLog('cubby', `[WRITE] hiring-traits/${cid} → human_feedback_score: ${performanceScore}`);
    if (result.new_weights) {
      addLog('cubby', `[WRITE] hiring-meta/trait_weights/${cRole} = ${JSON.stringify(result.new_weights)}`);
      addLog('system', `Compound Intelligence cycle complete. Weights updated for ${cRole}.`);
    }

    await fetchData();
    setIsDistilling(false);
    setActiveStep(6 as any);
  };
  const renderTraits = (traits: any) => {
    if (!traits) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">YOE</div><div className="font-semibold text-gray-900">{traits.years_of_experience}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Education</div><div className="font-semibold text-gray-900">{traits.education_level}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Skills Found</div><div className="font-semibold text-gray-900">{traits.skills?.length || 0}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Schools</div><div className="font-semibold text-gray-900">{traits.schools?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Hard Things</div><div className="font-semibold text-gray-900">{traits.hard_things_done?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Hackathons</div><div className="font-semibold text-gray-900">{traits.hackathons?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">OSS</div><div className="font-semibold text-gray-900">{traits.open_source_contributions?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Signals</div><div className="font-semibold text-gray-900">{traits.company_signals?.rating}/10</div></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b px-8 py-4 shadow-sm flex-shrink-0 z-10">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
              Cere Hiring Intelligence
            </h1>
            <p className="text-sm text-slate-500 mt-1">Compound Intelligence & Agent Orchestration Demo</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 bg-slate-100 py-2 px-4 rounded-full border border-slate-200">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> UI Mocking Event Runtime</span>
            <span className="border-l border-slate-300 h-4 mx-1"></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Agent Runtime: Mock (DDC-compatible)</span>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-8 gap-6">
        
        {/* Top Half: Process Stepper & Weights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-shrink-0">
          
          {/* Left: The Pipeline Stepper */}
          <div className="lg:col-span-7 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar">
              {[
                { step: 1, label: 'Apply' },
                { step: 2, label: 'AI Score' },
                { step: 3.5, label: 'Human Review' },
                { step: 4, label: 'Interview' },
                { step: 5, label: 'Distill' },
                { step: 6, label: 'Done' },
              ].map(({ step, label }, i) => (
                <React.Fragment key={label}>
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs shrink-0 ${(activeStep as number) >= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
                  <span className={`text-xs font-semibold ${(activeStep as number) >= step ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                  {i < 5 && <div className={`h-1 w-4 rounded shrink-0 ${(activeStep as number) > step ? 'bg-blue-600' : 'bg-slate-200'}`}></div>}
                </React.Fragment>
              ))}
            </div>

            <div className="p-6 relative overflow-y-auto">

              {/* STEP 1: Apply — form input */}
              {(activeStep === 1 || activeStep === 2) && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Candidate ID</label>
                      <input type="text" required value={candidateId} onChange={e => setCandidateId(e.target.value)} placeholder="e.g. join-8841" className="w-full p-2.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" disabled={loading} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Target Role (from Notion)</label>
                      <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-2.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" disabled={loading}>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Raw Resume Text</label>
                    <textarea required value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste candidate's raw resume here..." rows={6} className="w-full p-3 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs resize-none" disabled={loading} />
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded flex justify-center items-center gap-2 disabled:opacity-70">
                    {loading ? (<><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running Trait Extractor + Scorer...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Simulate Join.com Webhook</>)}
                  </button>
                </form>
              )}

              {/* STEP 2: AI Score result */}
              {activeStep === 3 && latestCandidate && data?.scores?.[`/${latestCandidate}`] && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{latestCandidate}</h3>
                      <p className="text-sm text-slate-500">{role}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 px-5 py-3 rounded-xl text-center">
                      <div className="text-xs text-blue-600 font-bold uppercase tracking-wide">AI Score</div>
                      <div className="text-4xl font-black text-blue-700 leading-none mt-1">
                        {data.scores[`/${latestCandidate}`].composite_score?.toFixed(1)}
                      </div>
                      <div className="text-xs text-blue-500 mt-0.5">/ 100</div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Extracted Traits — hiring-traits Cubby</div>
                  {renderTraits(data.traits[`/${latestCandidate}`])}
                  <button onClick={() => setActiveStep(3.5 as any)} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                    Proceed to Human Review →
                  </button>
                </div>
              )}

              {/* STEP 3: Human Review Score */}
              {activeStep === (3.5 as any) && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Human Review</h3>
                    <p className="text-sm text-slate-500">Hiring manager scores the candidate in Notion. This triggers the Distillation agent.</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <div className="text-sm font-semibold text-indigo-900 mb-4">How does <strong>{latestCandidate}</strong> look to you?</div>
                    <div className="flex gap-3">
                      <button onClick={() => handleOutcome(latestCandidate, role, 9)} className="flex-1 bg-white border-2 border-green-200 hover:border-green-500 hover:bg-green-50 text-green-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1">
                        <span className="text-2xl">⭐</span>
                        <span>9/10</span>
                        <span className="text-xs font-normal opacity-70">Exceptional</span>
                      </button>
                      <button onClick={() => handleOutcome(latestCandidate, role, 5)} className="flex-1 bg-white border-2 border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 text-yellow-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1">
                        <span className="text-2xl">🤔</span>
                        <span>5/10</span>
                        <span className="text-xs font-normal opacity-70">Average</span>
                      </button>
                      <button onClick={() => handleOutcome(latestCandidate, role, 2)} className="flex-1 bg-white border-2 border-red-200 hover:border-red-500 hover:bg-red-50 text-red-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1">
                        <span className="text-2xl">❌</span>
                        <span>2/10</span>
                        <span className="text-xs font-normal opacity-70">Poor Fit</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Interview Score */}
              {activeStep === 4 && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Interview Score</h3>
                      <p className="text-sm text-slate-500">Email poller picks up interview transcript → Llama analyzes it.</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg text-center text-sm">
                      <div className="text-xs text-slate-500">Human Review</div>
                      <div className="font-bold text-indigo-700">{data?.outcomes?.[`/${latestCandidate}`]?.outcome}/10</div>
                    </div>
                  </div>
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <div className="text-sm font-semibold text-teal-900 mb-3">📧 Simulate HR-2026-E2E Email Scraper Webhook</div>
                    <p className="text-xs text-slate-500 mb-4">Sends a mock interview transcript to the Interview Agent (Llama 3.2) for semantic analysis across 4 dimensions.</p>
                    <button onClick={() => handleInterview(latestCandidate, role)} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                      Ingest Interview Transcript
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: Distillation — 1 Month Performance Review */}
              {activeStep === 5 && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Distill — 1 Month Later</h3>
                    <p className="text-sm text-slate-500">The candidate was hired. After 1 month, their manager submits a performance review. The Distillation Agent uses this to update the role weights.</p>
                  </div>

                  {/* Interview analysis recap */}
                  {data?.interviews?.[`/${latestCandidate}`] && (
                    <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                      <div className="font-semibold text-teal-800 text-sm mb-2">Interview Analysis (LLM)</div>
                      <p className="text-xs text-slate-600 italic mb-3">"{data.interviews[`/${latestCandidate}`].analysis?.summary}"</p>
                      <div className="grid grid-cols-4 gap-2">
                        {['technical_depth','communication_clarity','cultural_fit','problem_solving'].map(k => (
                          <div key={k} className="bg-white p-2 rounded border border-teal-200 text-center">
                            <div className="text-[10px] text-slate-500 uppercase leading-tight">{k.replace(/_/g,' ')}</div>
                            <div className="font-bold text-teal-700 text-lg">{data.interviews[`/${latestCandidate}`].analysis?.[k]}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 1 month performance review */}
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">⏩</span>
                      <div className="font-bold text-amber-900 text-sm">1 Month Later — How is the employee performing?</div>
                    </div>
                    <p className="text-xs text-amber-700 mb-4">This score is fed back into the Distillation Agent to reinforce or penalize the traits that predicted this outcome.</p>
                    {isDistilling && (
                      <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 mb-3">
                        <svg className="animate-spin w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        <span className="text-xs font-semibold text-amber-800">Distillation Agent running — Gemini is updating role weights...</span>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button disabled={isDistilling} onClick={() => handleDistill(latestCandidate, role, 9)} className="flex-1 bg-white border-2 border-green-200 hover:border-green-500 hover:bg-green-50 text-green-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-green-200 disabled:hover:bg-white">
                        <span className="text-2xl">🚀</span>
                        <span>9/10</span>
                        <span className="text-xs font-normal opacity-70">Exceeding expectations</span>
                      </button>
                      <button disabled={isDistilling} onClick={() => handleDistill(latestCandidate, role, 5)} className="flex-1 bg-white border-2 border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 text-yellow-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-yellow-200 disabled:hover:bg-white">
                        <span className="text-2xl">🤝</span>
                        <span>5/10</span>
                        <span className="text-xs font-normal opacity-70">Meeting expectations</span>
                      </button>
                      <button disabled={isDistilling} onClick={() => handleDistill(latestCandidate, role, 2)} className="flex-1 bg-white border-2 border-red-200 hover:border-red-500 hover:bg-red-50 text-red-700 font-bold py-4 rounded-xl flex flex-col items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-red-200 disabled:hover:bg-white">
                        <span className="text-2xl">⚠️</span>
                        <span>2/10</span>
                        <span className="text-xs font-normal opacity-70">Underperforming</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: Compound Intelligence loop complete */}
              {activeStep === (6 as any) && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">🧠</div>
                    <h3 className="text-xl font-bold text-slate-900">Compound Intelligence Updated</h3>
                    <p className="text-sm text-slate-500 mt-1">The Distillation Agent has adjusted the role weights based on the 1-month performance outcome.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">What happened:</div>
                    <ul className="space-y-1.5 text-sm text-slate-600">
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold shrink-0">1.</span> Resume → Trait Extractor extracted 9 signals via LLM</li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold shrink-0">2.</span> AI Scorer calculated composite score against role weights</li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold shrink-0">3.</span> Human Review score recorded in Notion → first distillation pass</li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold shrink-0">4.</span> Interview transcript analyzed by LLM → stored in hiring-interviews</li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold shrink-0">5.</span> 1-month performance review → Distillation Agent updated role weights in hiring-meta</li>
                    </ul>
                  </div>
                  <div className="text-xs text-center text-slate-400">Check the <strong>Active Role Weights</strong> panel → the values have shifted to reflect this candidate's outcome.</div>
                  <button onClick={() => { setActiveStep(1); setLatestCandidate(null); setCandidateId(''); setResumeText(''); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
                    Process Another Candidate
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Right: Compound Intelligence / Meta Weights */}
          <div className="lg:col-span-5 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-bl border-b border-l border-blue-200 z-10 uppercase tracking-widest">
              Cubby: hiring-meta
            </div>
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Active Role Weights
              </h2>
              <p className="text-xs text-slate-500 mt-1">Dynamic scoring algorithm for <strong className="text-slate-700">{role}</strong></p>
            </div>
            <div className="p-5 flex-grow overflow-y-auto">
              <div className="space-y-3">
                {data?.meta && data.meta[`/trait_weights/${role}`] ? (
                  Object.entries(data.meta[`/trait_weights/${role}`])
                    .sort(([, a], [, b]) => (b as number) - (a as number)) // Sort by highest weight
                    .map(([trait, weight]: [string, any]) => (
                    <div key={trait} className="relative group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 uppercase tracking-wide">{trait.replace(/_/g, ' ')}</span>
                        <span className="font-bold text-blue-700">{(weight * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-2.5 rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${Math.min(100, weight * 100 * 2)}%` }} // Multiplied by 2 just to make small diffs more visible visually
                        ></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    Waiting for first agent execution to initialize weights...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sourcing Intelligence Panel */}
        {data?.meta?.['/sourcing_stats'] && Object.keys(data.meta['/sourcing_stats']).length > 0 && (
          <div className="flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <div>
                <span className="font-bold text-slate-800 text-sm">Sourcing Intelligence</span>
                <span className="text-xs text-slate-400 ml-2">hiring-meta/sourcing_stats</span>
              </div>
              <span className="ml-auto text-[10px] text-slate-400 italic">Which channels attract the best candidates?</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="pb-2 font-semibold">Source</th>
                    <th className="pb-2 font-semibold text-right">Candidates</th>
                    <th className="pb-2 font-semibold text-right">Avg AI Score</th>
                    <th className="pb-2 font-semibold text-right">Avg Human Score</th>
                    <th className="pb-2 font-semibold text-right">Avg Performance</th>
                    <th className="pb-2 font-semibold text-right">Hired</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.meta['/sourcing_stats']).map(([src, stats]: [string, any]) => (
                    <tr key={src} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 font-semibold text-slate-700 capitalize">{src}</td>
                      <td className="py-2 text-right text-slate-600">{stats.total_candidates}</td>
                      <td className="py-2 text-right">
                        <span className={`font-bold ${stats.avg_ai_score >= 70 ? 'text-green-600' : stats.avg_ai_score >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{stats.avg_ai_score}</span>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`font-bold ${stats.avg_human_score >= 7 ? 'text-green-600' : stats.avg_human_score >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{stats.avg_human_score}/10</span>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`font-bold ${stats.avg_performance_score >= 7 ? 'text-green-600' : stats.avg_performance_score >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{stats.performance_review_count > 0 ? `${stats.avg_performance_score}/10` : '—'}</span>
                      </td>
                      <td className="py-2 text-right text-slate-600">{stats.hired_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottom Half: Full Width Live Network/Cubby Terminal */}
        <div className="flex-grow flex flex-col bg-slate-900 rounded-xl shadow-inner border border-slate-800 overflow-hidden font-mono text-xs">
          <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 flex justify-between items-center text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
              </div>
              <span className="uppercase tracking-widest text-[10px] font-bold ml-2">Live DDC Network & Cubby Stream</span>
            </div>
            <button onClick={() => setTerminalLogs([])} className="hover:text-white transition-colors">clear</button>
          </div>
          
          <div className="p-4 overflow-y-auto flex-grow space-y-1.5 custom-scrollbar">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-600 italic">Listening for network events...</div>
            ) : (
              terminalLogs.map((log, i) => {
                let colorClass = 'text-slate-300';
                let prefix = '';
                
                if (log.type === 'system') {
                  colorClass = 'text-blue-400';
                  prefix = '[UI] ';
                } else if (log.type === 'network') {
                  colorClass = 'text-yellow-300';
                  prefix = '[NET] ';
                } else if (log.type === 'agent') {
                  colorClass = 'text-green-400';
                  prefix = '[AGENT] ';
                } else if (log.type === 'cubby') {
                  colorClass = 'text-purple-400 font-bold';
                  prefix = '[CUBBY] ';
                }

                // Make JSON payloads slightly dimmer for readability
                const messageParts = log.message.split(' = {');
                const isJson = messageParts.length > 1;

                return (
                  <div key={i} className={`flex ${colorClass} hover:bg-slate-800/50 px-1 rounded`}>
                    <span className="text-slate-600 w-24 shrink-0">{log.time}</span>
                    <span className="w-20 shrink-0 opacity-80">{prefix}</span>
                    <span className="break-all">
                      {isJson ? (
                        <>
                          {messageParts[0]} = <span className="text-slate-500 font-normal">{'{' + messageParts[1]}</span>
                        </>
                      ) : (
                        log.message
                      )}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f172a; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
