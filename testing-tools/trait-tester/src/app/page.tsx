'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Loader2, Save, CheckCircle, XCircle, Award } from 'lucide-react';

interface Job {
  id: string;
  name: string;
  file?: File;
  text?: string;
  source: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: any;
  error?: string;
  originalText?: string;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [source, setSource] = useState('resume');
  const [textInput, setTextInput] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newJobs = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      file,
      source: 'resume',
      status: 'pending' as const,
    }));
    
    setJobs((prev) => [...prev, ...newJobs]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf']
    },
    multiple: true,
  });

  const handleAddTextJob = () => {
    if (!textInput.trim()) return;
    
    const newJob: Job = {
      id: Math.random().toString(36).substring(7),
      name: `Pasted Text (${new Date().toLocaleTimeString()})`,
      text: textInput,
      source,
      status: 'pending',
    };
    
    setJobs((prev) => [...prev, newJob]);
    setTextInput('');
  };

  const processJob = async (jobId: string) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'processing', error: undefined } : j)));
    
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    try {
      const formData = new FormData();
      formData.append('source', job.source);
      
      if (job.file) {
        formData.append('file', job.file);
      } else if (job.text) {
        formData.append('text', job.text);
      }

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      
      const { _originalText, ...resultData } = data;
      
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { 
        ...j, 
        status: 'success', 
        result: resultData,
        originalText: _originalText 
      } : j)));
      
      setActiveJobId(jobId);
    } catch (err: any) {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error: err.message } : j)));
    }
  };

  const processAll = async () => {
    const pendingJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'error');
    for (const job of pendingJobs) {
      await processJob(job.id);
    }
  };

  const handleSaveLog = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || !job.result) return;
    
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          source: job.source, 
          result: job.result, 
          originalText: job.originalText 
        }),
      });
      alert('Result logged successfully!');
    } catch (err) {
      alert('Failed to log result');
    }
  };

  const activeJob = jobs.find((j) => j.id === activeJobId);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Trait Extractor Tester (Scored)</h1>
          <p className="text-gray-500 mt-2">Upload multiple PDFs/TXTs. Gemini will extract nuanced traits, rate them (0-10), and weigh them into a final Conclusive Score (0-100).</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Input & Queue Section */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Candidates</h2>
              
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors mb-6 ${
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                <UploadCloud className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {isDragActive ? 'Drop files here' : 'Drag & drop PDF/TXT files (multiple allowed)'}
                </p>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-2 text-xs text-gray-500 uppercase">OR PASTE TEXT</span>
                </div>
              </div>

              <div className="space-y-3">
                <select 
                  value={source} 
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="resume">Resume Text</option>
                  <option value="linkedin">LinkedIn Profile</option>
                </select>
                
                <textarea
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  placeholder="Paste text here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                
                <button
                  onClick={handleAddTextJob}
                  disabled={!textInput.trim()}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  Add Text to Queue
                </button>
              </div>
            </div>

            {/* Queue */}
            {jobs.length > 0 && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col max-h-[500px]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-md font-semibold text-gray-800">Queue ({jobs.length})</h2>
                  <button 
                    onClick={processAll}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md transition-colors"
                  >
                    Process All
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {jobs.map((job) => (
                    <div 
                      key={job.id} 
                      onClick={() => setActiveJobId(job.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                        activeJobId === job.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="truncate mr-3">
                        <p className="text-sm font-medium text-gray-800 truncate" title={job.name}>{job.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">{job.source}</span>
                          {job.status === 'success' && job.result?.conclusive_score !== undefined && (
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              Score: {job.result.conclusive_score}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        {job.status === 'pending' && <button onClick={(e) => { e.stopPropagation(); processJob(job.id); }} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">Run</button>}
                        {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                        {job.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {job.status === 'error' && <XCircle className="h-4 w-4 text-red-500" title={job.error} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-[600px]">
            {activeJob ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{activeJob.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">Status: <span className="font-semibold uppercase">{activeJob.status}</span></p>
                  </div>
                  {activeJob.status === 'success' && (
                    <button 
                      onClick={() => handleSaveLog(activeJob.id)}
                      className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-4 rounded-lg transition-colors"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Log
                    </button>
                  )}
                </div>

                {activeJob.status === 'error' && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm mb-4">
                    <strong>Error:</strong> {activeJob.error}
                  </div>
                )}

                {activeJob.status === 'processing' && (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Loader2 className="h-10 w-10 mb-3 animate-spin text-blue-500" />
                    <p>Extracting & Scoring traits with Gemini...</p>
                  </div>
                )}

                {activeJob.status === 'success' && activeJob.result && (
                  <div className="flex-1 flex flex-col space-y-6">
                    {/* Big Score Header */}
                    <div className={`p-6 rounded-2xl border-2 flex items-center justify-between ${getScoreColor(activeJob.result.conclusive_score)}`}>
                      <div className="flex items-center">
                        <Award className="h-10 w-10 mr-4 opacity-80" />
                        <div>
                          <h3 className="text-lg font-bold uppercase tracking-wider opacity-80">Conclusive Score</h3>
                          <p className="text-sm opacity-70">Weighted sum of nuanced traits</p>
                        </div>
                      </div>
                      <div className="text-5xl font-black">
                        {activeJob.result.conclusive_score}<span className="text-2xl opacity-50">/100</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <span className="block text-xs font-bold text-blue-800 mb-1 uppercase">Hard Things</span>
                        <div className="flex justify-between items-end">
                          <span className="text-2xl text-blue-900 font-black">{activeJob.result.hard_things_done?.rating || 0}<span className="text-sm opacity-50">/10</span></span>
                          <span className="text-xs text-blue-700 font-medium">({activeJob.result.hard_things_done?.items?.length || 0} items)</span>
                        </div>
                        <span className="text-xs text-blue-600/60 block mt-1">Weight: {activeJob.result._weights?.hard_things_done}x</span>
                      </div>

                      <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                        <span className="block text-xs font-bold text-green-800 mb-1 uppercase">Hackathons</span>
                        <div className="flex justify-between items-end">
                          <span className="text-2xl text-green-900 font-black">{activeJob.result.hackathons?.rating || 0}<span className="text-sm opacity-50">/10</span></span>
                          <span className="text-xs text-green-700 font-medium">({activeJob.result.hackathons?.items?.length || 0} items)</span>
                        </div>
                        <span className="text-xs text-green-600/60 block mt-1">Weight: {activeJob.result._weights?.hackathons}x</span>
                      </div>

                      <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                        <span className="block text-xs font-bold text-purple-800 mb-1 uppercase">Open Source</span>
                        <div className="flex justify-between items-end">
                          <span className="text-2xl text-purple-900 font-black">{activeJob.result.open_source_contributions?.rating || 0}<span className="text-sm opacity-50">/10</span></span>
                          <span className="text-xs text-purple-700 font-medium">({activeJob.result.open_source_contributions?.items?.length || 0} items)</span>
                        </div>
                        <span className="text-xs text-purple-600/60 block mt-1">Weight: {activeJob.result._weights?.open_source_contributions}x</span>
                      </div>

                      <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <span className="block text-xs font-bold text-orange-800 mb-1 uppercase">Companies</span>
                        <div className="flex justify-between items-end">
                          <span className="text-2xl text-orange-900 font-black">{activeJob.result.company_signals?.rating || 0}<span className="text-sm opacity-50">/10</span></span>
                          <span className="text-xs text-orange-700 font-medium">({activeJob.result.company_signals?.items?.length || 0} items)</span>
                        </div>
                        <span className="text-xs text-orange-600/60 block mt-1">Weight: {activeJob.result._weights?.company_signals}x</span>
                      </div>
                    </div>

                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                      <div className="flex flex-col h-full">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">JSON Result</h3>
                        <pre className="flex-1 bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-auto">
                          {JSON.stringify(activeJob.result, null, 2)}
                        </pre>
                      </div>
                      
                      {activeJob.originalText && (
                        <div className="flex flex-col h-full">
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Parsed Text</h3>
                          <div className="flex-1 bg-gray-50 border border-gray-200 p-4 rounded-lg text-xs font-mono text-gray-600 overflow-auto whitespace-pre-wrap">
                            {activeJob.originalText}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <FileText className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No candidate selected</p>
                <p className="text-sm mt-2">Upload files or select a job from the queue to view results.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
