declare module 'selfsigned' {
  interface SelfSignedAttrs { name: string; value: string }
  interface SelfSignedOpts {
    keySize?:    number
    days?:       number
    algorithm?:  string
    extensions?: object[]
    pkcs7?:      boolean
    clientCertificate?: boolean
  }
  interface SelfSignedResult { private: string; cert: string; public: string }
  function generate(attrs: SelfSignedAttrs[], opts?: SelfSignedOpts): SelfSignedResult
  export { generate }
}
