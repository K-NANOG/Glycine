import { clearLine, cursorTo } from 'readline';

export class Spinner {
    private frames: string[];
    private interval: NodeJS.Timeout | null;
    private currentFrame: number;
    private text: string;

    constructor() {
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = null;
        this.currentFrame = 0;
        this.text = '';
    }

    start(text: string): void {
        this.text = text;
        this.interval = setInterval(() => {
            const frame = this.frames[this.currentFrame];
            process.stdout.write('\r');
            clearLine(process.stdout, 0);
            cursorTo(process.stdout, 0);
            process.stdout.write(`${frame} ${this.text}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }

    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            process.stdout.write('\r');
            clearLine(process.stdout, 0);
            cursorTo(process.stdout, 0);
        }
    }

    update(text: string): void {
        this.text = text;
    }
} 