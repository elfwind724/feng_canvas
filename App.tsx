import React, { useState, useRef, useEffect } from 'react';
import { generateImage, refinePromptWithSearch, generateSpeech, suggestStyles } from './services/geminiService';
import { AppState, GeneratedImage, AspectRatio } from './types';
import { decodeAudioData, base64ToUint8Array, SAMPLE_RATE_OUTPUT } from './utils/audioUtils';

// Configuration Groups
const PARAMETER_GROUPS = [
  {
    title: "艺术风格",
    items: ["Photorealistic", "Anime", "Oil Painting", "Cyberpunk", "Concept Art", "Ukiyo-e", "Dreamy", "Vaporwave", "Watercolor", "Pixel Art", "Surrealism", "Impressionism", "Art Deco", "Baroque"]
  },
  {
    title: "角色特征",
    items: ["Chinese", "Japanese", "Western", "Male", "Female", "Portrait", "Full Body", "Fashion Model", "Candid Shot", "Close up"]
  },
  {
    title: "镜头与光影",
    items: ["Cinematic Lighting", "Kodak Portra", "Fujifilm", "35mm", "Wide Angle", "Macro", "Bokeh", "Film Grain", "Rembrandt Lighting", "Natural Light"]
  },
  {
    title: "环境细节",
    items: ["Golden Hour", "Neon Lights", "Nature", "Urban", "Snowy", "Rainy", "Studio", "Minimalist", "Chaotic", "Futuristic"]
  }
];

const ASPECT_RATIOS: { value: AspectRatio; label: string; dims: string }[] = [
  { value: '1:1', label: '1:1', dims: 'w-7 h-7' },
  { value: '4:3', label: '4:3', dims: 'w-9 h-7' },
  { value: '3:4', label: '3:4', dims: 'w-7 h-9' },
  { value: '16:9', label: '16:9', dims: 'w-11 h-6' },
  { value: '9:16', label: '9:16', dims: 'w-6 h-11' },
];

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  // State now holds an array of image URLs for the current generation session
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  
  const [error, setError] = useState<string | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggestingStyles, setIsSuggestingStyles] = useState(false);
  
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [selectedParams, setSelectedParams] = useState<Set<string>>(new Set());
  
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUTPUT });
      return () => {
          outputAudioCtxRef.current?.close();
      };
  }, []);

  const playTTS = async (text: string) => {
      if (!outputAudioCtxRef.current) return;
      try {
          const base64Audio = await generateSpeech(text);
          if (base64Audio) {
              const buffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  outputAudioCtxRef.current,
                  SAMPLE_RATE_OUTPUT,
                  1
              );
              const source = outputAudioCtxRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioCtxRef.current.destination);
              source.start();
          }
      } catch (e) {
          console.error("TTS Playback failed", e);
      }
  };

  const toggleParam = (param: string) => {
    const newSet = new Set(selectedParams);
    if (newSet.has(param)) {
      newSet.delete(param);
    } else {
      newSet.add(param);
    }
    setSelectedParams(newSet);
  };

  const handleRefinePrompt = async () => {
    if (!prompt.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
        const refined = await refinePromptWithSearch(prompt);
        setPrompt(refined);
    } catch (e) {
        setError("润色失败，请重试");
    } finally {
        setIsRefining(false);
    }
  };

  const handleSmartStyle = async () => {
      if (!prompt.trim()) {
          setError("请先输入一些描述");
          setTimeout(() => setError(null), 2000);
          return;
      }
      setIsSuggestingStyles(true);
      try {
          const suggestions = await suggestStyles(prompt, PARAMETER_GROUPS);
          const newSet = new Set(selectedParams);
          suggestions.forEach(s => newSet.add(s));
          setSelectedParams(newSet);
      } catch (e) {
          console.error(e);
      } finally {
          setIsSuggestingStyles(false);
      }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedParams.size === 0) return;
    
    setAppState(AppState.GENERATING_IMAGE);
    setError(null);
    setGeneratedImages([]); // Clear previous images
    setSelectedImageIndex(0);

    // Scroll to canvas on mobile to show loading state
    if (window.innerWidth < 768 && canvasRef.current) {
        setTimeout(() => {
           canvasRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    try {
        const paramsString = Array.from(selectedParams).join(', ');
        let finalPrompt = prompt;
        
        if (paramsString) {
           finalPrompt = finalPrompt ? `${finalPrompt}, ${paramsString}` : paramsString;
        }

        if (searchEnabled) {
             finalPrompt = await refinePromptWithSearch(finalPrompt);
             setPrompt(finalPrompt);
        }

        // Call service which now returns an array of strings
        const imageUrls = await generateImage(finalPrompt, aspectRatio);
        
        const newImages: GeneratedImage[] = imageUrls.map(url => ({
            url: url,
            prompt: finalPrompt,
            createdAt: Date.now()
        }));
        
        setGeneratedImages(newImages);

    } catch (err: any) {
        console.error(err);
        setError(err.message || "生成图片时遇到问题");
    } finally {
        setAppState(AppState.IDLE);
    }
  };

  return (
    // Updated Layout: Removed h-screen/overflow-hidden for mobile to allow scrolling
    // Added overflow-x-hidden to prevent horizontal scrolling issues
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-black font-sans relative text-white overflow-x-hidden md:h-screen md:overflow-hidden">
      
      {/* --- Global Dynamic Background --- */}
      <div className="absolute inset-0 z-0 fixed">
          {/* Base Gradient */}
          <div className="absolute inset-0 bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900"></div>
          {/* Animated Blobs */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/20 blur-[120px] animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[80px]"></div>
          
          {/* Grain Texture */}
          <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiAvPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9IjAuMSIgLz4KPC9zdmc+')] pointer-events-none"></div>
      </div>

      {/* --- Left Control Panel (Glassmorphism Sidebar) --- */}
      {/* Updated sizing: h-auto on mobile, h-full on desktop */}
      <div className="w-full md:w-[420px] flex flex-col z-20 relative border-b md:border-r md:border-b-0 border-white/10 bg-black/20 backdrop-blur-2xl shadow-[10px_0_30px_rgba(0,0,0,0.3)] md:h-full">
        
        {/* App Header */}
        <div className="pt-8 pb-6 px-8 flex items-center justify-between border-b border-white/5 bg-white/5 backdrop-blur-xl">
           <div>
             <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
               冯老师的梦幻画板
             </h1>
             <p className="text-[10px] font-medium text-white/40 tracking-widest uppercase mt-1">Visionary AI Canvas v0.1</p>
           </div>
           <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
           </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-8 pb-32 md:pb-6">
            
            {/* Prompt Input Area */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> 创意描述
                    </label>
                    
                    {/* Smart Refine Button */}
                    <button 
                        onClick={handleRefinePrompt}
                        disabled={isRefining || !prompt}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-300 border backdrop-blur-md ${
                            isRefining 
                                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                                : prompt 
                                    ? 'bg-white/10 border-white/10 text-white hover:bg-white/20 hover:border-white/30' 
                                    : 'opacity-50 cursor-not-allowed bg-white/5 border-transparent'
                        }`}
                    >
                        {isRefining ? <span className="animate-pulse">优化中...</span> : <span>⚡️ 智能润色</span>}
                    </button>
                </div>
                
                <div className="relative group transition-all duration-300">
                    <textarea
                        className="w-full h-36 bg-black/20 text-white p-4 rounded-2xl border border-white/10 focus:border-indigo-500/50 focus:bg-black/40 focus:ring-1 focus:ring-indigo-500/30 transition-all outline-none resize-none text-sm leading-relaxed placeholder-white/20 backdrop-blur-sm"
                        placeholder="在此描述你梦中的画面... 例如：一只赛博朋克风格的猫在霓虹灯下的东京街头"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> 画布比例
                </label>
                <div className="grid grid-cols-5 gap-2">
                    {ASPECT_RATIOS.map((ratio) => (
                        <button
                            key={ratio.value}
                            onClick={() => setAspectRatio(ratio.value)}
                            className={`group flex flex-col items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 border relative overflow-hidden ${
                                aspectRatio === ratio.value
                                    ? 'bg-gradient-to-b from-indigo-600/80 to-violet-700/80 border-indigo-400/50 text-white shadow-lg'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/50'
                            }`}
                        >
                            <div className={`border-2 rounded-[2px] transition-all ${ratio.dims} ${aspectRatio === ratio.value ? 'border-white bg-white/20' : 'border-current opacity-50'}`}></div>
                            <span className="text-[9px] font-bold tracking-wider">{ratio.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Google Grounding Toggle */}
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-0.5 rounded-2xl">
                <div className="bg-[#0F1115]/90 backdrop-blur-xl p-4 rounded-[14px] flex items-center justify-between border border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-2 rounded-lg shadow-lg shadow-blue-500/20 text-white">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-white">现实数据增强</h3>
                            <p className="text-[10px] text-white/50">联网获取最新信息优化画面</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setSearchEnabled(!searchEnabled)}
                        className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-300 ${searchEnabled ? 'bg-blue-500' : 'bg-white/10'}`}
                    >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${searchEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            {/* Parameters Section */}
            <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> 风格参数
                    </label>
                    
                    {/* AI Smart Style Button */}
                    <button
                        onClick={handleSmartStyle}
                        disabled={isSuggestingStyles}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border shadow-lg ${
                            isSuggestingStyles
                            ? 'bg-violet-600/50 border-violet-500 text-white cursor-wait'
                            : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 border-transparent text-white hover:scale-105 hover:shadow-violet-500/30'
                        }`}
                    >
                        {isSuggestingStyles ? (
                             <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                        )}
                        <span>{isSuggestingStyles ? '分析中...' : 'AI 自动选风格'}</span>
                    </button>
                 </div>

                <div className="space-y-6 pb-20 md:pb-0">
                    {PARAMETER_GROUPS.map((group) => (
                        <div key={group.title} className="space-y-2.5">
                            <div className="text-[10px] font-semibold text-white/40 uppercase ml-1">{group.title}</div>
                            <div className="flex flex-wrap gap-2">
                                {group.items.map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => toggleParam(item)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-300 border select-none ${
                                            selectedParams.has(item)
                                                ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)] transform scale-105'
                                                : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
                                        }`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

         {/* Floating Bottom Bar for Generate */}
         <div className="fixed bottom-0 left-0 md:left-0 w-full md:w-[420px] p-6 bg-gradient-to-t from-black/90 via-black/80 to-transparent z-30 backdrop-blur-sm">
             <button
                onClick={handleGenerate}
                disabled={appState !== AppState.IDLE || (!prompt && selectedParams.size === 0)}
                className={`w-full h-14 rounded-2xl font-bold text-[16px] tracking-wide text-white shadow-2xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 overflow-hidden relative group ${
                    appState === AppState.GENERATING_IMAGE 
                    ? 'bg-white/10 cursor-wait border border-white/10' 
                    : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] hover:bg-[position:right_center] border border-white/10'
                }`}
            >
                {appState === AppState.GENERATING_IMAGE ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="animate-pulse">正在绘制梦境...</span>
                    </>
                ) : (
                    <>
                        <span className="text-xl">✨</span>
                        立即生成作品 (2张)
                    </>
                )}
            </button>
         </div>
      </div>

      {/* --- Right Canvas Area --- */}
      {/* Updated sizing: min-h-screen on mobile to allow scroll, added bottom padding */}
      <div ref={canvasRef} className="flex-1 relative flex flex-col items-center justify-center p-6 pb-32 md:p-12 md:pb-12 overflow-hidden z-10 min-h-[70vh] md:min-h-0 md:h-full bg-black/40 md:bg-transparent">
         
         <div className="w-full max-w-4xl h-full flex flex-col justify-center animate-fade-in-up relative z-20">
            {error && (
                <div className="mb-6 bg-red-500/20 border border-red-500/30 text-red-100 px-4 py-3 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            <div className="relative w-full h-full flex flex-col items-center justify-center">
                {generatedImages.length > 0 ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                        {/* Image Frame */}
                        <div className={`relative rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(139,92,246,0.25)] ring-1 ring-white/20 transition-all duration-700 ease-out transform bg-black/50 backdrop-blur-sm ${
                            aspectRatio === '1:1' ? 'aspect-square max-h-[60vh]' : 
                            aspectRatio === '16:9' ? 'aspect-video max-h-[50vh]' : 
                            aspectRatio === '4:3' ? 'aspect-[4/3] max-h-[60vh]' : 
                            aspectRatio === '3:4' ? 'aspect-[3/4] max-h-[70vh]' : 
                            'aspect-[9/16] max-h-[70vh]'
                        }`}>
                            <img 
                                src={generatedImages[selectedImageIndex].url} 
                                alt="Generated Art" 
                                className="w-full h-full object-contain"
                            />
                            
                            {/* Floating Action Bar */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-2 py-2 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 opacity-0 hover:opacity-100 transition-all duration-300 shadow-2xl transform translate-y-2 hover:translate-y-0 z-50">
                                <button onClick={() => playTTS(generatedImages[selectedImageIndex].prompt)} className="p-3 hover:bg-white/20 rounded-full text-white/90 transition-colors" title="朗读提示词">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                                </button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <a href={generatedImages[selectedImageIndex].url} download={`dreamcanvas-${generatedImages[selectedImageIndex].createdAt}.jpg`} className="p-3 hover:bg-white/20 rounded-full text-white/90 transition-colors" title="下载图片">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                </a>
                            </div>
                        </div>

                        {/* Image Selector (Thumbnails) */}
                        {generatedImages.length > 1 && (
                             <div className="mt-6 flex gap-4 justify-center">
                                 {generatedImages.map((img, idx) => (
                                     <button 
                                        key={idx}
                                        onClick={() => setSelectedImageIndex(idx)}
                                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                                            selectedImageIndex === idx 
                                            ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-110' 
                                            : 'border-white/20 opacity-50 hover:opacity-100 hover:scale-105'
                                        }`}
                                     >
                                         <img src={img.url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                                     </button>
                                 ))}
                             </div>
                        )}
                        
                        <div className="mt-6 max-w-2xl text-center pb-12 md:pb-0">
                            <div className="inline-block backdrop-blur-xl bg-white/5 border border-white/10 px-6 py-3 rounded-2xl shadow-lg">
                                <p className="text-indigo-200/80 text-sm font-light leading-relaxed tracking-wide">
                                    {generatedImages[selectedImageIndex].prompt}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Empty State
                    <div className="flex flex-col items-center justify-center p-12 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-sm text-center max-w-md">
                        <div className="w-20 h-20 mb-6 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center ring-1 ring-white/20 shadow-[0_0_30px_rgba(139,92,246,0.15)] animate-pulse">
                            <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <h2 className="text-2xl font-semibold text-white mb-3">开始创作</h2>
                        <p className="text-white/40 text-sm leading-relaxed">
                            在左侧输入您的灵感，或者点击标签。
                            <br/>不知从何下手？试试 <span className="text-indigo-400">AI 自动选风格</span>。
                        </p>
                    </div>
                )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default App;