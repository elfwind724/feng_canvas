import { GoogleGenAI, Modality, Schema, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Image Generation ---
export const generateImage = async (prompt: string, aspectRatio: string = '1:1'): Promise<string[]> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 2,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    if (!response.generatedImages) {
        throw new Error("No images generated");
    }

    return response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

// --- Prompt Enhancement with Search Grounding ---
export const refinePromptWithSearch = async (originalPrompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are an expert prompt engineer for AI image generation. 
      The user wants an image based on this idea: "${originalPrompt}".
      
      1. Use Google Search to find accurate details (dates, visual styles, accurate descriptions of people/places) if the prompt implies specific real-world entities.
      2. Rewrite the prompt to be highly descriptive, visual, and artistic.
      3. Return ONLY the refined prompt text. Do not include explanations.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text || originalPrompt;
  } catch (error) {
    console.error("Prompt Refinement Error:", error);
    return originalPrompt;
  }
};

// --- Smart Style Suggestion ---
export const suggestStyles = async (prompt: string, parameterGroups: {title: string, items: string[]}[]): Promise<string[]> => {
  try {
    // Flatten all items into a single list for the model to choose from
    const allItems = parameterGroups.flatMap(g => g.items);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following image prompt: "${prompt}".
      Select the most appropriate style, lighting, and character tags from the provided list that would enhance this image.
      Return a JSON array of strings containing only the selected tags.
      
      List of valid tags: ${JSON.stringify(allItems)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Style Suggestion Error:", error);
    return [];
  }
};

// --- Text to Speech ---
export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

// --- Live API Connection ---
// Returns the session object directly to control lifecycle in the component
export const connectLiveSession = async (
  onOpen: () => void,
  onMessage: (message: any) => void,
  onError: (e: any) => void,
  onClose: (e: any) => void
) => {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: onOpen,
      onmessage: onMessage,
      onerror: onError,
      onclose: onClose,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {}, // Enable transcription so we know what user said
      systemInstruction: "You are a creative visual assistant. Help the user brainstorm ideas for image generation. Keep your responses concise, encouraging, and visually descriptive. Ask clarifying questions about style, lighting, and mood.",
    },
  });
};