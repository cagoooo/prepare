import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
import opencc

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
    print(f"Received request data: {data}")

    prompt = f"""
請使用繁體中文回答，並使用台灣常用的詞彙及口語表達。

請為以下教學活動生成一個完整的十二年國教教案：

教學領域名稱：{data['subject']}
實施年級：{data['grade']}
單元名稱：{data['unit']}

額外細節：{data['details']}

請生成一個包含以下欄位的 HTML 表格，標題為「教學活動設計」：

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
17. 課前準備
18. 教學活動內容及實施方式
19. 課後延伸
20. 評量方式

請在生成的HTML表格中，確保在第5、6、10和15項的欄位名稱後面都加上"（僅提供參考）"的標註。

請特別注意「教學活動內容及實施方式」部分，總時間為 40 分鐘，應包含以下詳細資訊：
1. 引起動機：描述如何吸引學生注意力並引導他們進入學習狀態。請說明此階段預計花費的時間。
2. 發展活動：
   a. 詳細說明每個教學步驟，包括每個步驟的時間分配。
   b. 描述教師如何引導學生思考、討論或操作。
   c. 提供具體的問題示例或活動指引。
3. 綜合活動：說明如何幫助學生整合所學知識，並指明這個階段預計的時間。

請確保每個部分都有充分且具體的描述，包括時間分配，使教師能夠輕鬆理解並執行這個教案。
"""

    print(f"Generated prompt:\n{prompt}")

    try:
        print("Sending request to OpenAI API...")
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "text"}
        )
        print(f"Received response from OpenAI API: {response}")

        content = response.choices[0].message.content
        if not content:
            raise ValueError("OpenAI returned an empty response.")

        # 將簡體中文轉換為繁體中文
        converter = opencc.OpenCC('s2twp.json')
        content = converter.convert(content)

        # 移除 HTML 註釋和總結句
        content = content.replace('```html', '').replace('```', '').strip()
        content = content.split('</table>')[0] + '</table>'

        print(f"Processed content:\n{content}")

        # Wrap the content in a div for easier styling
        formatted_content = f"<div class='lesson-plan'>{content}</div>"
        print(f"Final formatted content:\n{formatted_content}")

        return jsonify({"success": True, "plan": formatted_content})
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
