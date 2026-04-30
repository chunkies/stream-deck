declare const Haptic: {
  supported:  boolean
  tap():      void
  hold():     void
  ratchet():  void
  success():  void
  error():    void
  listening(): void
  double():   void
}

interface SpeechRecognitionEvent extends Event {
  readonly results:     SpeechRecognitionResultList
  readonly resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error:   string
  readonly message: string
}

declare class SpeechRecognition {
  continuous:     boolean
  interimResults: boolean
  lang:           string
  onresult:  ((e: SpeechRecognitionEvent) => void)      | null
  onerror:   ((e: SpeechRecognitionErrorEvent) => void) | null
  onend:     (() => void) | null
  start(): void
  stop():  void
}

declare interface Window {
  SpeechRecognition?:        typeof SpeechRecognition
  webkitSpeechRecognition?:  typeof SpeechRecognition
}
