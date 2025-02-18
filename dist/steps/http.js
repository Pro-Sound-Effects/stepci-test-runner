"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const got_1 = __importDefault(require("got"));
const parse_duration_1 = __importDefault(require("parse-duration"));
const proxy_agent_1 = require("proxy-agent");
const xpath_1 = __importDefault(require("xpath"));
const cheerio = __importStar(require("cheerio"));
const xmldom_1 = require("@xmldom/xmldom");
const jsonpath_plus_1 = require("jsonpath-plus");
const { co2 } = require('@tgwf/co2');
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_https_1 = require("node:https");
const node_path_1 = __importDefault(require("node:path"));
const files_1 = require("./../utils/files");
const runner_1 = require("./../utils/runner");
const auth_1 = require("./../utils/auth");
const matcher_1 = require("../matcher");
async function default_1(params, captures, cookies, schemaValidator, options, config) {
    const stepResult = {
        type: 'http',
    };
    const ssw = new co2();
    let requestBody;
    let url = params.url || '';
    // Prefix URL
    if (config?.http?.baseURL) {
        try {
            new URL(url);
        }
        catch {
            url = config.http.baseURL + params.url;
        }
    }
    // Body
    if (params.body) {
        requestBody = await (0, files_1.tryFile)(params.body, {
            workflowPath: options?.path,
        });
    }
    //  JSON
    if (params.json) {
        if (!params.headers)
            params.headers = {};
        if (!params.headers['Content-Type']) {
            params.headers['Content-Type'] = 'application/json';
        }
        requestBody = JSON.stringify(params.json);
    }
    // GraphQL
    if (params.graphql) {
        params.method = 'POST';
        if (!params.headers)
            params.headers = {};
        params.headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(params.graphql);
    }
    // tRPC
    if (params.trpc) {
        if (params.trpc.query) {
            params.method = 'GET';
            // tRPC Batch queries
            if (Array.isArray(params.trpc.query)) {
                const payload = params.trpc.query.map((e) => {
                    return {
                        op: Object.keys(e)[0],
                        data: Object.values(e)[0],
                    };
                });
                const procedures = payload.map((p) => p.op).join(',');
                url = url + '/' + procedures.replaceAll('/', '.');
                params.params = {
                    batch: '1',
                    input: JSON.stringify(Object.assign({}, payload.map((p) => p.data))),
                };
            }
            else {
                const [procedure, data] = Object.entries(params.trpc.query)[0];
                url = url + '/' + procedure.replaceAll('/', '.');
                params.params = {
                    input: JSON.stringify(data),
                };
            }
        }
        if (params.trpc.mutation) {
            const [procedure, data] = Object.entries(params.trpc.mutation)[0];
            params.method = 'POST';
            url = url + '/' + procedure;
            requestBody = JSON.stringify(data);
        }
    }
    // Form Data
    if (params.form) {
        const formData = new URLSearchParams();
        for (const field in params.form) {
            formData.append(field, params.form[field]);
        }
        requestBody = formData.toString();
    }
    // Multipart Form Data
    if (params.formData) {
        const formData = new form_data_1.default();
        for (const field in params.formData) {
            const appendOptions = {};
            if (typeof params.formData[field] != 'object') {
                formData.append(field, params.formData[field]);
            }
            else if (Array.isArray(params.formData[field])) {
                const stepFiles = params.formData[field];
                for (const stepFile of stepFiles) {
                    const filepath = node_path_1.default.join(node_path_1.default.dirname(options?.path || __dirname), stepFile.file);
                    appendOptions.filename = node_path_1.default.parse(filepath).base;
                    formData.append(field, await fs_1.default.promises.readFile(filepath), appendOptions);
                }
            }
            else if (params.formData[field].file) {
                const stepFile = params.formData[field];
                const filepath = node_path_1.default.join(node_path_1.default.dirname(options?.path || __dirname), stepFile.file);
                appendOptions.filename = node_path_1.default.parse(filepath).base;
                formData.append(field, await fs_1.default.promises.readFile(filepath), appendOptions);
            }
            else {
                const requestPart = params.formData[field];
                if ('json' in requestPart) {
                    appendOptions.contentType = 'application/json';
                    formData.append(field, JSON.stringify(requestPart.json), appendOptions);
                }
                else {
                    appendOptions.contentType = requestPart.type;
                    formData.append(field, requestPart.value, appendOptions);
                }
            }
        }
        requestBody = formData;
    }
    // Auth
    let clientCredentials;
    if (params.auth) {
        const authHeader = await (0, auth_1.getAuthHeader)(params.auth);
        if (authHeader) {
            if (!params.headers)
                params.headers = {};
            params.headers['Authorization'] = authHeader;
        }
        clientCredentials = await (0, auth_1.getClientCertificate)(params.auth.certificate, {
            workflowPath: options?.path,
        });
    }
    // Set Cookies
    if (params.cookies) {
        for (const cookie in params.cookies) {
            await cookies.setCookie(cookie + '=' + params.cookies[cookie], url);
        }
    }
    let sslCertificate;
    let requestSize = 0;
    let responseSize = 0;
    // Make a request
    const res = await (0, got_1.default)(url, {
        agent: {
            http: new proxy_agent_1.ProxyAgent(),
            https: new proxy_agent_1.ProxyAgent(new node_https_1.Agent({ maxCachedSessions: 0 })),
        },
        method: params.method,
        headers: { ...params.headers },
        body: requestBody,
        searchParams: params.params
            ? new URLSearchParams(params.params)
            : undefined,
        throwHttpErrors: false,
        followRedirect: params.followRedirects ?? true,
        timeout: typeof params.timeout === 'string'
            ? (0, parse_duration_1.default)(params.timeout)
            : params.timeout,
        retry: params.retries ?? 0,
        cookieJar: cookies,
        http2: config?.http?.http2 ?? false,
        https: {
            ...clientCredentials,
            rejectUnauthorized: config?.http?.rejectUnauthorized ?? false,
        },
    })
        .on('request', (request) => options?.ee?.emit('step:http_request', request))
        .on('request', (request) => {
        request.once('socket', (s) => {
            s.once('close', () => {
                requestSize = request.socket?.bytesWritten;
                responseSize = request.socket?.bytesRead;
            });
        });
    })
        .on('response', (response) => options?.ee?.emit('step:http_response', response))
        .on('response', (response) => {
        if (response.socket.getPeerCertificate) {
            sslCertificate = response.socket.getPeerCertificate();
            if (Object.keys(sslCertificate).length === 0)
                sslCertificate = undefined;
        }
    });
    const responseData = res.rawBody;
    const body = new TextDecoder().decode(responseData);
    stepResult.request = {
        protocol: 'HTTP/1.1',
        url: res.url,
        method: params.method,
        headers: params.headers,
        body: requestBody,
        size: requestSize,
    };
    stepResult.response = {
        protocol: `HTTP/${res.httpVersion}`,
        status: res.statusCode,
        statusText: res.statusMessage,
        duration: res.timings.phases.total,
        headers: res.headers,
        contentType: res.headers['content-type']?.split(';')[0],
        timings: res.timings,
        body: responseData,
        size: responseSize,
        bodySize: responseData.length,
        co2: ssw.perByte(responseData.length),
    };
    if (sslCertificate) {
        stepResult.response.ssl = {
            valid: new Date(sslCertificate.valid_to) > new Date(),
            signed: sslCertificate.issuer.CN !== sslCertificate.subject.CN,
            validUntil: new Date(sslCertificate.valid_to),
            daysUntilExpiration: Math.round(Math.abs(new Date().valueOf() - new Date(sslCertificate.valid_to).valueOf()) /
                (24 * 60 * 60 * 1000)),
        };
    }
    // Captures
    if (params.captures) {
        for (const name in params.captures) {
            const capture = params.captures[name];
            if (capture.jsonpath) {
                try {
                    const json = JSON.parse(body);
                    captures[name] = (0, jsonpath_plus_1.JSONPath)({ path: capture.jsonpath, json, wrap: false });
                }
                catch {
                    captures[name] = undefined;
                }
            }
            if (capture.xpath) {
                const dom = new xmldom_1.DOMParser().parseFromString(body);
                const result = xpath_1.default.select(capture.xpath, dom);
                captures[name] =
                    result.length > 0 ? result[0].firstChild.data : undefined;
            }
            if (capture.header) {
                captures[name] = res.headers[capture.header];
            }
            if (capture.selector) {
                const dom = cheerio.load(body);
                captures[name] = dom(capture.selector).html();
            }
            if (capture.cookie) {
                captures[name] = (0, runner_1.getCookie)(cookies, capture.cookie, res.url);
            }
            if (capture.regex) {
                captures[name] = body.match(capture.regex)?.[1];
            }
            if (capture.body) {
                captures[name] = body;
            }
        }
    }
    if (params.check) {
        stepResult.checks = {};
        // Check headers
        if (params.check.headers) {
            stepResult.checks.headers = {};
            for (const header in params.check.headers) {
                stepResult.checks.headers[header] = (0, matcher_1.checkResult)(res.headers[header.toLowerCase()], params.check.headers[header]);
            }
        }
        // Check body
        if (params.check.body) {
            stepResult.checks.body = (0, matcher_1.checkResult)(body.trim(), params.check.body);
        }
        // Check JSON
        if (params.check.json) {
            try {
                const json = JSON.parse(body);
                stepResult.checks.json = (0, matcher_1.checkResult)(json, params.check.json);
            }
            catch {
                stepResult.checks.json = {
                    expected: params.check.json,
                    given: body,
                    passed: false,
                };
            }
        }
        // Check Schema
        if (params.check.schema) {
            let sample = body;
            if (res.headers['content-type']?.includes('json')) {
                sample = JSON.parse(body);
            }
            const validate = schemaValidator.compile(params.check.schema);
            stepResult.checks.schema = {
                expected: params.check.schema,
                given: sample,
                passed: validate(sample),
            };
        }
        // Check JSONPath
        if (params.check.jsonpath) {
            stepResult.checks.jsonpath = {};
            try {
                const json = JSON.parse(body);
                for (const path in params.check.jsonpath) {
                    // jsonpath by design returns single strings in arrays for [*].id or [?(@.id=='stc')].id (but not for [1].id);
                    // when adding arrays to workflow.yml it breaks all the testing, so unpack single array entries by default
                    let result = (0, jsonpath_plus_1.JSONPath)({ path, json, wrap: false });
                    if (Array.isArray(result) && result.length == 1)
                        result = result[0];
                    stepResult.checks.jsonpath[path] = (0, matcher_1.checkResult)(result, params.check.jsonpath[path]);
                }
            }
            catch {
                for (const path in params.check.jsonpath) {
                    stepResult.checks.jsonpath[path] = {
                        expected: params.check.jsonpath[path],
                        given: body,
                        passed: false,
                    };
                }
            }
        }
        // Check XPath
        if (params.check.xpath) {
            stepResult.checks.xpath = {};
            for (const path in params.check.xpath) {
                const dom = new xmldom_1.DOMParser().parseFromString(body);
                const result = xpath_1.default.select(path, dom);
                stepResult.checks.xpath[path] = (0, matcher_1.checkResult)(result.length > 0 ? result[0].firstChild.data : undefined, params.check.xpath[path]);
            }
        }
        // Check HTML5 Selectors
        if (params.check.selectors) {
            stepResult.checks.selectors = {};
            const dom = cheerio.load(body);
            for (const selector in params.check.selectors) {
                const result = dom(selector).html();
                stepResult.checks.selectors[selector] = (0, matcher_1.checkResult)(result, params.check.selectors[selector]);
            }
        }
        // Check Cookies
        if (params.check.cookies) {
            stepResult.checks.cookies = {};
            for (const cookie in params.check.cookies) {
                const value = (0, runner_1.getCookie)(cookies, cookie, res.url);
                stepResult.checks.cookies[cookie] = (0, matcher_1.checkResult)(value, params.check.cookies[cookie]);
            }
        }
        // Check captures
        if (params.check.captures) {
            stepResult.checks.captures = {};
            for (const capture in params.check.captures) {
                stepResult.checks.captures[capture] = (0, matcher_1.checkResult)(captures[capture], params.check.captures[capture]);
            }
        }
        // Check status
        if (params.check.status) {
            stepResult.checks.status = (0, matcher_1.checkResult)(res.statusCode, params.check.status);
        }
        // Check statusText
        if (params.check.statusText) {
            stepResult.checks.statusText = (0, matcher_1.checkResult)(res.statusMessage, params.check.statusText);
        }
        // Check whether request was redirected
        if ('redirected' in params.check) {
            stepResult.checks.redirected = (0, matcher_1.checkResult)(res.redirectUrls.length > 0, params.check.redirected);
        }
        // Check redirects
        if (params.check.redirects) {
            stepResult.checks.redirects = (0, matcher_1.checkResult)(res.redirectUrls, params.check.redirects);
        }
        // Check sha256
        if (params.check.sha256) {
            const hash = node_crypto_1.default
                .createHash('sha256')
                .update(Buffer.from(responseData))
                .digest('hex');
            stepResult.checks.sha256 = (0, matcher_1.checkResult)(hash, params.check.sha256);
        }
        // Check md5
        if (params.check.md5) {
            const hash = node_crypto_1.default
                .createHash('md5')
                .update(Buffer.from(responseData))
                .digest('hex');
            stepResult.checks.md5 = (0, matcher_1.checkResult)(hash, params.check.md5);
        }
        // Check Performance
        if (params.check.performance) {
            stepResult.checks.performance = {};
            for (const metric in params.check.performance) {
                stepResult.checks.performance[metric] = (0, matcher_1.checkResult)(res.timings.phases[metric], params.check.performance[metric]);
            }
        }
        // Check SSL certs
        if (params.check.ssl && sslCertificate) {
            stepResult.checks.ssl = {};
            if ('valid' in params.check.ssl) {
                stepResult.checks.ssl.valid = (0, matcher_1.checkResult)(stepResult.response?.ssl.valid, params.check.ssl.valid);
            }
            if ('signed' in params.check.ssl) {
                stepResult.checks.ssl.signed = (0, matcher_1.checkResult)(stepResult.response?.ssl.signed, params.check.ssl.signed);
            }
            if (params.check.ssl.daysUntilExpiration) {
                stepResult.checks.ssl.daysUntilExpiration = (0, matcher_1.checkResult)(stepResult.response?.ssl.daysUntilExpiration, params.check.ssl.daysUntilExpiration);
            }
        }
        // Check request/response size
        if (params.check.size) {
            stepResult.checks.size = (0, matcher_1.checkResult)(responseSize, params.check.size);
        }
        if (params.check.requestSize) {
            stepResult.checks.requestSize = (0, matcher_1.checkResult)(requestSize, params.check.requestSize);
        }
        if (params.check.bodySize) {
            stepResult.checks.bodySize = (0, matcher_1.checkResult)(stepResult.response?.bodySize, params.check.bodySize);
        }
        if (params.check.co2) {
            stepResult.checks.co2 = (0, matcher_1.checkResult)(stepResult.response.co2, params.check.co2);
        }
    }
    return stepResult;
}
exports.default = default_1;
