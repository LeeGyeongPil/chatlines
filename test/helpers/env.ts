// Import this FIRST in every test file. It pins the language to English no matter which
// locale the machine or the CI runner uses, so tests never depend on LANG.
process.env.LANG = 'en_US.UTF-8';
delete process.env.LC_ALL;
delete process.env.LC_MESSAGES;
delete process.env.CHATLINES_LANG;
// A corporate or sandbox proxy would intercept 127.0.0.1 traffic; nothing here needs a network.
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete process.env[k];
process.env.NO_PROXY = '127.0.0.1,localhost';

export const PINNED_LANG = 'en';
