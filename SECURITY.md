# 보안 정책 / Security policy

보안 취약점을 발견하셨다면 **공개 이슈 대신** 이 레포의 **Security → Report a vulnerability**(비공개 취약점 신고)로 알려 주세요. 확인 후 답변드리고, 고친 버전을 릴리스하면서 함께 안내합니다.

If you find a security issue, please **do not open a public issue**. Use **Security → Report a vulnerability** in this repository to report it privately. We will reply after checking and announce the fix with a release.

chatlines는 VS Code 안에서만 동작하며 네트워크 연결을 열지 않고 데이터를 어디로도 보내지 않습니다. 웹뷰는 nonce 기반 CSP 아래 번들된 스크립트만 불러옵니다. / chatlines runs inside VS Code, opens no network connections and sends no data anywhere; the webview loads only bundled scripts under a nonce-based CSP.
