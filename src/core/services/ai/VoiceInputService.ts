/**
 * VoiceInputService
 * Speech-to-text abstraction with graceful fallback and Arabic dialect support.
 */

// Define SpeechRecognition interface for browser compatibility
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export interface VoiceRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export class VoiceInputService {
  private recognition: any = null;
  private isListening = false;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  /**
   * Starts listening for Arabic speech and returns a promise with the recognized text
   */
  public startListening(
    onResult: (result: VoiceRecognitionResult) => void,
    onError: (errorMessage: string) => void,
    onEnd: () => void
  ): void {
    if (!this.isSupported()) {
      onError('خاصية الإدخال الصوتي غير مدعومة على هذا المتصفح أو الجهاز.');
      return;
    }

    try {
      const win = window as IWindowWithSpeech;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionClass();

      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'ar-SA';

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const transcript = finalTranscript || interimTranscript;
        onResult({
          transcript,
          isFinal: !!finalTranscript,
        });
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        let msg = 'حدث خطأ أثناء التعرف على الصوت.';
        if (event.error === 'not-allowed') {
          msg = 'يرجى السماح بالوصول إلى الميكروفون لاستخدام الإدخال الصوتي.';
        } else if (event.error === 'no-speech') {
          msg = 'لم يتم رصد أي صوت. يرجى المحاولة مجدداً.';
        }
        onError(msg);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        onEnd();
      };

      this.recognition.start();
    } catch (err: any) {
      this.isListening = false;
      onError('تعذر بدء التسجيل الصوتي.');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
      this.isListening = false;
    }
  }

  public getListeningState(): boolean {
    return this.isListening;
  }
}

export const voiceInputService = new VoiceInputService();
