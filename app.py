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
    
    請包含以下欄位，並使用適當的HTML標籤來組織內容：
    1. 領域名稱
    2. 設計者
    3. 實施年級
    4. 單元名稱
    5. 總綱核心素養（僅提供參考）
    6. 領綱核心素養（僅提供參考）
    7. 核心素養呼應說明
    8. 學習重點-學習表現
    9. 學習重點-學習內容
    10. 議題融入-實質內涵（僅提供參考）
    11. 議題融入-所融入之學習重點
    12. 教材來源
    13. 教學資源-教師
    14. 教學資源-學生
    15. 學習目標（僅提供參考）
    16. 教學重點
    17. 教學活動內容及實施方式
    18. 評量方式
    
    請使用<table>, <tr>, <td>等HTML標籤來組織這些欄位，確保生成的HTML結構清晰、易於樣式化。
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
        
        # Wrap the content in a div for easier styling
        formatted_content = f"<div class='lesson-plan'>{content}</div>"
        return jsonify({"success": True, "plan": formatted_content})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
