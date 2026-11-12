#!/usr/bin/env python3
"""Generate examples/{en,ko}/*.jsonl and test/fixtures/python-style.json with the real
Python json.dumps, so expected bytes are what Python really writes (not a JS guess).

Run once and commit the result:  python3 scripts/gen-examples.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEXT = {
    "en": {
        "sys": "You are a concise assistant.",
        "q_hello": "Say hello in one short sentence.",
        "a_hello": "Hello! How can I help you today?",
        "q_sum": "Summarize: The meeting moved from Monday to Wednesday because two people are away.",
        "a_sum": "The meeting is now on Wednesday because two people are away on Monday.",
        "q_weather": "What is the weather in Seoul right now?",
        "a_weather": "It is 12 degrees and sunny in Seoul.",
        "weather_tool": "Looks up the current weather for a city.",
        "tool_weather": '{"city": "Seoul", "temp_c": 12, "sky": "sunny"}',
        "q_convert": "Convert 5 miles to kilometers, then 10 pounds to kilograms.",
        "a_convert": "5 miles is about 8.05 km, and 10 pounds is about 4.54 kg.",
        "convert_tool": "Converts a value between two units.",
        "tool_km": '{"value": 8.05, "unit": "km"}',
        "tool_kg": '{"value": 4.54, "unit": "kg"}',
        "q_no_tool": "Name three primary colors.",
        "a_no_tool": "Red, blue and yellow.",
        "sg_q": "Translate 'good morning' to French.",
        "sg_a": "Bonjour.",
        "sg_q2": "What is the weather in Busan?",
        "sg_obs": '{"city": "Busan", "temp_c": 15}',
        "sg_a2": "It is 15 degrees in Busan.",
        "al_inst1": "Fix the spelling of the sentence.",
        "al_in1": "Thiss is a tset.",
        "al_out1": "This is a test.",
        "al_inst2": "Name the capital of France.",
        "al_out2": "The capital of France is Paris.",
        "al_inst3": "Write a one-line greeting for a new teammate.",
        "al_out3": "Welcome to the team, we are glad you are here!",
        "b_q1": "Classify the sentiment of: I love this phone.",
        "b_q2": "Classify the sentiment of: The battery died in an hour.",
        "b_a1": "positive",
        "b_a2": "negative",
        "py_q": "How is the weather in Seoul? Answer with the temperature.",
        "py_a": "Seoul is sunny, 12°C ☀",
        "py_q2": "Thanks! And tomorrow?",
        "py_a2": "Tomorrow looks cloudy, around 9°C.",
        "mx_ok_q": "Say hi.",
        "mx_ok_a": "Hi there!",
        "mx_tool_result": '{"temp_c": 20}',
        "mx_err": "The request was rejected by the server.",
        "mx_unknown_note": "this line is not a chat",
    },
    "ko": {
        "sys": "당신은 간결하게 답하는 도우미입니다.",
        "q_hello": "짧은 한 문장으로 인사해 줘.",
        "a_hello": "안녕하세요! 오늘 무엇을 도와드릴까요?",
        "q_sum": "요약해 줘: 두 사람이 자리를 비워서 회의가 월요일에서 수요일로 옮겨졌습니다.",
        "a_sum": "두 사람이 월요일에 자리를 비워서 회의는 수요일로 옮겨졌습니다.",
        "q_weather": "지금 서울 날씨가 어때?",
        "a_weather": "서울은 지금 맑고 12도입니다.",
        "weather_tool": "도시의 현재 날씨를 조회합니다.",
        "tool_weather": '{"city": "서울", "temp_c": 12, "sky": "맑음"}',
        "q_convert": "5마일을 킬로미터로, 10파운드를 킬로그램으로 바꿔 줘.",
        "a_convert": "5마일은 약 8.05km, 10파운드는 약 4.54kg입니다.",
        "convert_tool": "두 단위 사이에서 값을 변환합니다.",
        "tool_km": '{"value": 8.05, "unit": "km"}',
        "tool_kg": '{"value": 4.54, "unit": "kg"}',
        "q_no_tool": "삼원색 세 가지를 말해 줘.",
        "a_no_tool": "빨강, 파랑, 노랑입니다.",
        "sg_q": "'좋은 아침'을 프랑스어로 번역해 줘.",
        "sg_a": "Bonjour.",
        "sg_q2": "부산 날씨는 어때?",
        "sg_obs": '{"city": "부산", "temp_c": 15}',
        "sg_a2": "부산은 15도입니다.",
        "al_inst1": "문장의 맞춤법을 고쳐 줘.",
        "al_in1": "오늘 날씨가 조타.",
        "al_out1": "오늘 날씨가 좋다.",
        "al_inst2": "프랑스의 수도를 말해 줘.",
        "al_out2": "프랑스의 수도는 파리입니다.",
        "al_inst3": "새로 온 팀원에게 건넬 한 줄 인사를 써 줘.",
        "al_out3": "팀에 오신 것을 환영합니다, 함께하게 되어 기쁩니다!",
        "b_q1": "다음 문장의 감정을 분류해 줘: 이 휴대폰 정말 마음에 들어.",
        "b_q2": "다음 문장의 감정을 분류해 줘: 배터리가 한 시간 만에 닳았어.",
        "b_a1": "긍정",
        "b_a2": "부정",
        "py_q": "서울 날씨 어때? 기온으로 답해 줘.",
        "py_a": "서울은 맑고 12°C ☀",
        "py_q2": "고마워! 내일은?",
        "py_a2": "내일은 흐리고 9°C 안팎입니다.",
        "mx_ok_q": "인사해 줘.",
        "mx_ok_a": "안녕하세요!",
        "mx_tool_result": '{"temp_c": 20}',
        "mx_err": "서버가 요청을 거부했습니다.",
        "mx_unknown_note": "이 줄은 채팅이 아닙니다",
    },
}


def dumps(obj, **kw):
    return json.dumps(obj, ensure_ascii=False, **kw)


def tools_def(name, desc, props):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": list(props)}}}


def build(lang):
    t = TEXT[lang]
    out = {}
    msg = lambda r, c, **k: {"role": r, **({"content": c} if c is not None else {}), **k}

    out["openai-chat"] = [
        dumps({"messages": [msg("system", t["sys"]), msg("user", t["q_hello"]), msg("assistant", t["a_hello"])]}),
        dumps({"messages": [msg("user", t["q_sum"]), msg("assistant", t["a_sum"], weight=1)]}),
        dumps({"messages": [msg("user", [{"type": "text", "text": t["q_no_tool"]}]), msg("assistant", t["a_no_tool"])]}),
    ]

    weather = tools_def("get_weather", t["weather_tool"], {"city": {"type": "string"}})
    convert = tools_def("convert_units", t["convert_tool"], {"value": {"type": "number"}, "unit": {"type": "string"}})
    city = "서울" if lang == "ko" else "Seoul"
    out["openai-tools"] = [
        dumps({"messages": [
            msg("system", t["sys"]),
            msg("user", t["q_weather"]),
            msg("assistant", None, tool_calls=[{"id": "call_w1", "type": "function",
                "function": {"name": "get_weather", "arguments": dumps({"city": city})}}]),
            msg("tool", t["tool_weather"], tool_call_id="call_w1"),
            msg("assistant", t["a_weather"]),
        ], "tools": [weather]}),
        dumps({"messages": [
            msg("user", t["q_convert"]),
            msg("assistant", None, tool_calls=[
                {"id": "call_c1", "type": "function", "function": {"name": "convert_units", "arguments": dumps({"value": 5, "unit": "mile"})}},
                {"id": "call_c2", "type": "function", "function": {"name": "convert_units", "arguments": dumps({"value": 10, "unit": "pound"})}},
            ]),
            msg("tool", t["tool_km"], tool_call_id="call_c1"),
            msg("tool", t["tool_kg"], tool_call_id="call_c2"),
            msg("assistant", t["a_convert"]),
        ], "tools": [convert]}),
        dumps({"messages": [msg("user", t["q_no_tool"]), msg("assistant", t["a_no_tool"])], "tools": [weather]}),
    ]

    out["sharegpt"] = [
        dumps({"conversations": [{"from": "human", "value": t["sg_q"]}, {"from": "gpt", "value": t["sg_a"]}]}),
        dumps({"conversations": [
            {"from": "human", "value": t["sg_q2"]},
            {"from": "function_call", "value": dumps({"name": "get_weather", "arguments": {"city": "부산" if lang == "ko" else "Busan"}})},
            {"from": "observation", "value": t["sg_obs"]},
            {"from": "gpt", "value": t["sg_a2"]},
        ], "system": t["sys"]}),
    ]

    out["alpaca"] = [
        dumps({"instruction": t["al_inst1"], "input": t["al_in1"], "output": t["al_out1"]}),
        dumps({"instruction": t["al_inst2"], "input": "", "output": t["al_out2"]}),
        dumps({"instruction": t["al_inst3"], "input": "", "output": t["al_out3"]}),
    ]

    def breq(cid, q):
        return dumps({"custom_id": cid, "method": "POST", "url": "/v1/chat/completions",
                      "body": {"model": "gpt-4o-mini", "messages": [msg("system", t["sys"]), msg("user", q)], "max_tokens": 50}})
    out["batch-request"] = [breq("req-1", t["b_q1"]), breq("req-2", t["b_q2"])]

    def bresp(cid, a):
        return dumps({"id": "batch_req_" + cid, "custom_id": cid, "response": {"status_code": 200, "request_id": "r-" + cid,
                      "body": {"id": "chatcmpl-" + cid, "model": "gpt-4o-mini", "choices": [
                          {"index": 0, "message": msg("assistant", a), "finish_reason": "stop"}]}}, "error": None})
    out["batch-response"] = [bresp("req-1", t["b_a1"]), bresp("req-2", t["b_a2"])]

    # ensure_ascii=True, default separators: what a plain json.dumps(obj) writes.
    py = lambda o: json.dumps(o)
    out["python-style"] = [
        py({"messages": [msg("user", t["py_q"]), msg("assistant", t["py_a"])], "score": 1.0}),
        py({"messages": [msg("user", t["py_q"]), msg("assistant", t["py_a"]), msg("user", t["py_q2"]), msg("assistant", t["py_a2"])], "score": 0.5}),
        py({"messages": [msg("user", t["q_no_tool"]), msg("assistant", t["a_no_tool"])], "score": 1.0}),
    ]

    out["mixed-problems"] = [
        dumps({"messages": [msg("user", t["mx_ok_q"]), msg("assistant", t["mx_ok_a"])]}),
        '{"messages": [{"role": "user", "content": "' + t["mx_ok_q"] + '"}, {"role": "assistant", "content": ',
        dumps({"note": t["mx_unknown_note"], "id": 7}),
        dumps({"messages": [msg("user", t["q_weather"]), msg("tool", t["mx_tool_result"], tool_call_id="call_missing"), msg("assistant", t["a_weather"])]}),
        dumps({"id": "batch_req_9", "custom_id": "req-9", "response": {"status_code": 429, "body": {"error": {"message": t["mx_err"]}}}, "error": None}),
        dumps({"messages": [msg("user", t["mx_ok_q"]), msg("assistant", t["mx_ok_a"])]}),
    ]
    return out


def main():
    for lang in ("en", "ko"):
        d = os.path.join(ROOT, "examples", lang)
        os.makedirs(d, exist_ok=True)
        for name, lines in build(lang).items():
            with open(os.path.join(d, name + ".jsonl"), "w", encoding="utf-8", newline="\n") as f:
                f.write("\n".join(lines) + "\n")

    # Expected bytes for the style tests: edit the 3rd message and one tool-call argument.
    new_text = "12°C, 서울 🌤"
    styles = {
        "ascii-default": dict(ensure_ascii=True),
        "utf8-default": dict(ensure_ascii=False),
        "ascii-compact": dict(ensure_ascii=True, separators=(",", ":")),
        "utf8-compact": dict(ensure_ascii=False, separators=(",", ":")),
    }
    cases = []
    for name, kw in styles.items():
        def enc(o, kw=kw):
            return json.dumps(o, **kw)
        args_kw = dict(kw)
        def build_obj(content, args_obj):
            return {"messages": [
                {"role": "user", "content": "서울 날씨는? ☀ / 안녕"},
                {"role": "assistant", "content": None, "tool_calls": [{"id": "call_1", "type": "function",
                    "function": {"name": "get_weather", "arguments": json.dumps(args_obj, **args_kw)}}]},
                {"role": "tool", "content": content, "tool_call_id": "call_1"},
            ], "weight": 1.0}
        before = enc(build_obj("old", {"city": "Seoul"}))
        after_text = enc(build_obj(new_text, {"city": "Seoul"}))
        after_args = enc(build_obj("old", {"city": "Busan", "unit": "C"}))
        cases.append({
            "style": name,
            "before": before,
            "textPath": ["messages", 2, "content"],
            "newText": new_text,
            "afterText": after_text,
            "argsPath": ["messages", 1, "tool_calls", 0, "function", "arguments"],
            "newArgs": '{"city":"Busan","unit":"C"}',
            "afterArgs": after_args,
        })
    with open(os.path.join(ROOT, "test", "fixtures", "python-style.json"), "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
