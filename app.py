import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI

app = Flask(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY is not set. Some features may not work.")
    openai_client = None
else:
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_plan', methods=['POST'])
def generate_plan():
    if not openai_client:
        return jsonify({"success": False, "error": "OpenAI API key is not set"}), 500

    data = request.json
    prompt = f"""
    請為以下教學活動生成一個完整的十二年國教教案：
    
    教學領域名稱：{data['subject']}
    實施年級：{data['grade']}
    單元名稱：{data['unit']}
    
    額外細節：{data['details']}
    
    請包含以下欄位：
    1. 教學目標
    2. 教學活動
    3. 評量方式
    4. 教學資源
    5. 注意事項
    
    請以HTML格式回覆，使用適當的標籤來組織內容。
    """
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Using gpt-4o-mini as per the blueprint suggestion
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "text"}  # Keeping text format as we need HTML output
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("OpenAI returned an empty response.")
        return jsonify({"success": True, "plan": content})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
