'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [candidateId, setCandidateId] = useState('');
  const [role, setRole] = useState('Senior Backend Engineer');
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const fetchData = async () => {
    const res = await fetch('/api/data');
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, role, resumeText })
    });
    const result = await res.json();
    if (result.logs) setLogs(prev => [...prev, ...result.logs]);
    await fetchData();
    setLoading(false);
    setCandidateId('');
    setResumeText('');
  };

  const handleOutcome = async (cid: string, cRole: string, outcome: string) => {
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome })
    });
    const result = await res.json();
    if (result.logs) setLogs(prev => [...prev, ...result.logs]);
    await fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <header className="mb-8 border-b pb-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">CEF Hiring Pipeline PoC</h1>
            <p className="text-gray-600 max-w-2xl">
              Demonstrating <strong>Compound Intelligence</strong> on the Cere DDC Network. This UI executes actual Agent Typescript code, while mocking the underlying network infrastructure until the `ddc-node` dev branch is stable.
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800 max-w-sm">
            <div className="font-bold flex items-center gap-2 mb-1">
              <span>⚠️</span> Environment Status
            </div>
            <p className="leading-tight">
              <strong>Agents:</strong> Real TS Code (`src/agents/*`)<br/>
              <strong>Cubbies:</strong> Mocked in Next.js memory<br/>
              <strong>V8 Isolate:</strong> Mocked via standard Node execution
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Left Column: Input Form & Architecture Explainer */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-4">Trigger Pipeline</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Candidate ID</label>
              <input 
                type="text" 
                required
                value={candidateId}
                onChange={e => setCandidateId(e.target.value)}
                placeholder="e.g. cand-001"
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select 
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Senior Backend Engineer">Senior Backend Engineer</option>
                <option value="Frontend Developer">Frontend Developer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resume Text</label>
              <textarea 
                required
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
                placeholder="Paste resume text here..."
                rows={6}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Hint: Try using words like "Python", "Rust", "scalable", "architecture", "led team".</p>
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing through Agents...' : 'Submit Application'}
            </button>
          </form>
        </div>

        {/* Architecture Explainer Card */}
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl shadow-sm text-indigo-900">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              How this works
            </h3>
            <div className="text-sm space-y-3 opacity-80">
              <p>When you click submit, a <strong>NEW_APPLICATION</strong> event is sent to the <code>Concierge</code> agent.</p>
              <p>The Concierge spawns the <code>Trait Extractor</code> and <code>Scorer</code> agents.</p>
              <p>These agents cannot communicate directly. They share state by reading and writing to <strong>Cubbies</strong> (Persistent hierarchical Redis JSON/Vector stores).</p>
            </div>
        </div>
      </div>

        {/* Right Column: State & Data */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* Compound Intelligence Meta Data */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl shadow-sm border border-blue-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-bl-lg">
              Cubby: hiring-meta
            </div>
            <h2 className="text-xl font-semibold mb-2 text-blue-900 flex items-center gap-2">
              🧠 Current Role Weights
            </h2>
            <p className="text-sm text-blue-700 mb-4">
              These weights are updated dynamically by the <code>Distillation</code> agent whenever a downstream outcome is recorded.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {data?.meta && data.meta[`/trait_weights/${role}`] ? (
                Object.entries(data.meta[`/trait_weights/${role}`]).map(([trait, weight]: [string, any]) => (
                  <div key={trait} className="bg-white p-3 rounded-lg shadow-sm">
                    <div className="text-xs text-gray-500 uppercase font-semibold">{trait.replace('_', ' ')}</div>
                    <div className="text-2xl font-bold text-blue-700">{(weight * 100).toFixed(1)}%</div>
                  </div>
                ))
              ) : (
                <div className="col-span-4 text-gray-500 italic">No weights established for this role yet. Default is 25% each.</div>
              )}
            </div>
          </div>

          {/* Candidates Pipeline Data */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1 rounded-bl-lg">
              Cubbies: hiring-traits, hiring-scores, hiring-outcomes
            </div>
            <h2 className="text-xl font-semibold mb-4">Pipeline Results</h2>
            {data?.scores && Object.keys(data.scores).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(data.scores).reverse().map(([id, score]: [string, any]) => {
                  const traits = data.traits[id];
                  const outcome = data.outcomes[id];
                  return (
                    <div key={id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{id.replace('/', '')}</h3>
                          <p className="text-sm text-gray-500">Scored on: {new Date(score.timestamp).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-black text-green-600">{typeof score.composite_score === 'number' ? score.composite_score.toFixed(2) : '0.00'}</div>
                          <div className="text-xs text-gray-500">Composite Score</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        {traits && (
                          <>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">YOE:</span> <span className="font-semibold">{traits.years_of_experience}</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Edu:</span> <span className="font-semibold">{traits.education_level}</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Skills:</span> <span className="font-semibold">{traits.skills?.length || 0}</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Schools:</span> <span className="font-semibold">{traits.schools?.rating}/10</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Hard Things:</span> <span className="font-semibold">{traits.hard_things_done?.rating}/10</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Hackathons:</span> <span className="font-semibold">{traits.hackathons?.rating}/10</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">OSS:</span> <span className="font-semibold">{traits.open_source_contributions?.rating}/10</span></div>
                            <div className="bg-gray-50 p-2 rounded text-sm"><span className="text-gray-500">Signals:</span> <span className="font-semibold">{traits.company_signals?.rating}/10</span></div>
                          </>
                        )}
                      </div>

                      <div className="border-t pt-3 mt-3">
                        {!outcome ? (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm font-medium text-gray-700 mr-2">Simulate Outcome (Triggers Distillation):</span>
                            <button 
                              onClick={() => handleOutcome(id.replace('/', ''), role, 'Hired_Performing_Well')}
                              className="text-xs bg-green-100 hover:bg-green-200 text-green-800 py-1 px-3 rounded-full font-medium transition-colors"
                            >
                              👍 Hired & Performing Well
                            </button>
                            <button 
                              onClick={() => handleOutcome(id.replace('/', ''), role, 'Hired_Underperforming')}
                              className="text-xs bg-red-100 hover:bg-red-200 text-red-800 py-1 px-3 rounded-full font-medium transition-colors"
                            >
                              👎 Hired but Underperforming
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm font-medium">
                            Outcome recorded: <span className={outcome.outcome.includes('Well') ? 'text-green-600' : 'text-red-600'}>{outcome.outcome}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
                No candidates processed yet. Submit an application to begin.
              </div>
            )}
          </div>
          
          {/* Agent Logs */}
          <div className="bg-gray-900 text-green-400 p-6 rounded-xl shadow-sm border border-gray-800 font-mono text-sm max-h-64 overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
              <span className="text-green-500">▶</span> Agent Runtime Logs
            </h2>
            {logs.length > 0 ? (
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600 italic">Waiting for agents to execute...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
