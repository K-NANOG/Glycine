import React from 'react';

interface LogMessage {
    message: string;
    type: 'info' | 'error' | 'success';
    timestamp: string;
}

interface ConsoleOutputProps {
    messages: LogMessage[];
    isCrawling?: boolean;
}

const Spinner = () => {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const [frame, setFrame] = React.useState(0);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setFrame(f => (f + 1) % frames.length);
        }, 80);
        return () => clearInterval(timer);
    }, []);

    return <span className="text-blue-400">{frames[frame]}</span>;
};

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ messages, isCrawling }) => {
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const getMessageColor = (type: LogMessage['type']) => {
        switch (type) {
            case 'error':
                return 'text-red-400';
            case 'success':
                return 'text-green-400';
            default:
                return 'text-white/70';
        }
    };

    return (
        <div className="bg-black/90 font-mono text-sm rounded-lg overflow-hidden">
            <div className="max-h-[32rem] overflow-y-auto p-4">
                <div className="space-y-1">
                    {messages.map((msg, index) => (
                        <div 
                            key={index} 
                            className={`${getMessageColor(msg.type)} opacity-0 animate-fade-in`}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <span className="text-white/40 mr-3">[{new Date(msg.timestamp).toLocaleTimeString()}]</span>
                            <span>{msg.message}</span>
                        </div>
                    ))}
                    {isCrawling && (
                        <div className="text-white/70 flex items-center space-x-2">
                            <span className="text-white/40 mr-3">[{new Date().toLocaleTimeString()}]</span>
                            <Spinner />
                            <span>Crawling in progress...</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
        </div>
    );
}; 