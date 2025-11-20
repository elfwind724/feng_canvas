import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connectLiveSession } from '../services/geminiService';
import { createAudioBlob, decodeAudioData, base64ToUint8Array, SAMPLE_RATE_INPUT, SAMPLE_RATE_OUTPUT } from '../utils/audioUtils';
import { AppState } from '../types';

interface VoiceAssistantProps {
  onTranscript: (text: string) => void;
  isListening: boolean;
  onToggleListening: () => void;
  appState: AppState;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ onTranscript, isListening, onToggleListening, appState }) => {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const sessionRef = useRef<any>(null);
  const audioContextInputRef = useRef<AudioContext | null>(null);
  const audioContextOutputRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopAudio = useCallback(() => {
      if (audioContextInputRef.current) {
          audioContextInputRef.current.close();
          audioContextInputRef.current = null;
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }
      sourceNodesRef.current.forEach(node => node.stop());
      sourceNodesRef.current.clear();
      
      // We don't close the output context to allow TTS later, 
      // but we reset timing.
      nextStartTimeRef.current = 0;
  }, []);

  const startSession = async () => {
    setConnectionStatus('connecting');
    
    try {
      // Setup Audio Output
      if (!audioContextOutputRef.current) {
        audioContextOutputRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUTPUT });
      }

      // Setup Audio Input
      audioContextInputRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_INPUT });
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const source = audioContextInputRef.current.createMediaStreamSource(streamRef.current);
      const processor = audioContextInputRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const sessionPromise = connectLiveSession(
        () => {
          console.log("Live API Connected");
          setConnectionStatus('connected');
        },
        async (message: any) => {
           // Handle Transcription (User Input)
           if (message.serverContent?.inputTranscription) {
             const text = message.serverContent.inputTranscription.text;
             if (text) {
                 onTranscript(text);
             }
           }

           // Handle Audio Output (Model Response)
           const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
           if (base64Audio && audioContextOutputRef.current) {
             const ctx = audioContextOutputRef.current;
             nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
             
             const audioBuffer = await decodeAudioData(
               base64ToUint8Array(base64Audio),
               ctx,
               SAMPLE_RATE_OUTPUT,
               1
             );
             
             const sourceNode = ctx.createBufferSource();
             sourceNode.buffer = audioBuffer;
             sourceNode.connect(ctx.destination);
             
             sourceNode.addEventListener('ended', () => {
                sourceNodesRef.current.delete(sourceNode);
             });
             
             sourceNode.start(nextStartTimeRef.current);
             nextStartTimeRef.current += audioBuffer.duration;
             sourceNodesRef.current.add(sourceNode);
           }
           
           // Handle interruptions
            if (message.serverContent?.interrupted) {
                sourceNodesRef.current.forEach(node => node.stop());
                sourceNodesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
        },
        (err) => {
          console.error("Live API Error", err);
          setConnectionStatus('disconnected');
          onToggleListening(); // Force toggle off
        },
        () => {
          console.log("Live API Closed");
          setConnectionStatus('disconnected');
        }
      );

      sessionRef.current = sessionPromise;

      // Start Streaming Audio Input
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const blobData = createAudioBlob(inputData);
        
        sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: blobData });
        });
      };

      source.connect(processor);
      processor.connect(audioContextInputRef.current.destination);

    } catch (err) {
      console.error("Failed to start audio session", err);
      setConnectionStatus('disconnected');
      onToggleListening();
    }
  };

  // Handle Toggle Logic
  useEffect(() => {
    if (isListening && connectionStatus === 'disconnected') {
      startSession();
    } else if (!isListening && connectionStatus === 'connected') {
       stopAudio();
       if (sessionRef.current) {
           sessionRef.current.then((s: any) => s.close());
           sessionRef.current = null;
       }
       setConnectionStatus('disconnected');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (sessionRef.current) {
          sessionRef.current.then((s: any) => s.close().catch(() => {}));
      }
      if (audioContextOutputRef.current) {
          audioContextOutputRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <button
        onClick={onToggleListening}
        className={`relative group flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-lg ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 scale-110 animate-pulse'
            : 'bg-indigo-600 hover:bg-indigo-500'
        }`}
      >
        {isListening ? (
           // Stop Icon
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
             <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
           </svg>
        ) : (
            // Mic Icon
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        )}
        
        {/* Ring animation for speaking */}
        {isListening && (
            <span className="absolute w-full h-full rounded-full border-4 border-red-400 opacity-50 animate-ping"></span>
        )}
      </button>
      
      <p className="mt-4 text-sm font-medium text-slate-400 h-6">
        {isListening ? "I'm listening... Describe your idea." : "Tap to speak"}
      </p>
    </div>
  );
};