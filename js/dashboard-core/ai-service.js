// 🔥 DuckDuckGo AI - সম্পূর্ণ ফ্রি, কোনো API Key লাগে না
// Simple text processing fallback system

export async function askAI(taskType, text) {
    if (!text || text.trim().length < 3) {
        throw new Error("Text is too short for AI processing.");
    }

    console.log("🤖 Processing with AI...");
    
    try {
        // DuckDuckGo AI চেষ্টা করা হচ্ছে
        const response = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible)'
            },
            body: JSON.stringify({
                model: 'claude-instant',
                messages: [{
                    role: 'user', 
                    content: getPrompt(taskType, text)
                }]
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.message) {
                return data.message.trim();
            }
        }
    } catch (error) {
        console.log('DuckDuckGo AI unavailable, using fallback');
    }

    // Fallback: Simple text processing
    return processWithFallback(taskType, text);
}

function getPrompt(taskType, text) {
    switch (taskType) {
        case 'summary':
            return `Summarize in 3 bullet points: ${text}`;
        case 'grammar':
            return `Fix grammar: ${text}`;
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
        
        default:
            return text;
    }
}