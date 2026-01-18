// js/dashboard/ai-service.js

export async function askAI(taskType, text) {
    if (!text || text.trim().length < 5) {
        throw new Error("লেখাটি খুবই ছোট! অন্তত ৫টি অক্ষর লিখুন।");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // ৮ সেকেন্ড টাইমআউট

    try {
        // ১. প্রথমে VQD Token সংগ্রহ করা (এটি ছাড়া DuckDuckGo কাজ করবে না)
        const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
            headers: { 'x-vqd-accept': '1' },
            signal: controller.signal
        });
        const vqd = statusRes.headers.get('x-vqd-token');

        if (!vqd) throw new Error("VQD Token failed");

        // ২. AI-এর কাছে রিকোয়েস্ট পাঠানো
        const response = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-vqd-token': vqd
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: getPrompt(taskType, text) }]
            })
        });

        clearTimeout(timeoutId);
        if (!response.ok) throw new Error("AI Server Error");

        // ৩. রেসপন্স প্রসেস করা (এটি Stream আকারে আসে, তাই টেক্সট বের করতে হবে)
        const data = await response.text();
        
        // DuckDuckGo-র রেসপন্স থেকে মেসেজ অংশটি ফিল্টার করা
        const lines = data.split('\n');
        let fullMessage = "";
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.replace('data: ', '');
                if (jsonStr === '[DONE]') break;
                try {
                    const json = JSON.parse(jsonStr);
                    if (json.message) fullMessage += json.message;
                } catch (e) {}
            }
        }

        return fullMessage || processWithFallback(taskType, text);

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn("AI timed out, using fallback.");
        }
        console.error('AI Error:', error);
        return processWithFallback(taskType, text);
    }
}

function getPrompt(taskType, text) {
    switch (taskType) {
        case 'write':
            return `Write a professional and detailed response (like an email or formal note) for: ${text}`;
        case 'summary':
            return `Summarize this in 3 bullet points: ${text}`;
        case 'grammar':
            return `Fix grammar and make it professional: ${text}`;
        case 'tags':
            return `Generate 5 hashtags for: ${text}`;
        default:
            return text;
    }
}

function processWithFallback(taskType, text) {
    switch (taskType) {
        case 'summary':
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
            return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
        
        case 'grammar':
            return text.replace(/\s+/g, ' ').trim();
        
        case 'tags':
            const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
            const uniqueWords = [...new Set(words)];
            return uniqueWords.slice(0, 5).map(w => `#${w}`).join(' ');
        
        case 'write':
            return `Based on your request: "${text}"\n\nHere's a professional draft:\n\n[This would be a detailed response based on your instruction. The AI service is currently unavailable, but your request has been noted.]`;
        
        default:
            return text;
    }
}