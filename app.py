from flask import Flask, render_template, request, jsonify, send_file
import os
import openai
from bs4 import BeautifulSoup
from docx import Document
import io

app = Flask(__name__)

# Set OpenAI API key
openai.api_key = os.getenv('OPENAI_API_KEY')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_plan', methods=['POST'])
def generate_plan():
    try:
        data = request.json
        subject = data.get('subject')
        grade = data.get('grade')
        unit = data.get('unit')
        details = data.get('details', '')

        # 建立提示文本
        prompt = f"""請針對以下教學內容，設計一份完整的教案：
        教學領域：{subject}
        實施年級：{grade}
        單元名稱：{unit}
        額外細節：{details}

        請包含以下項目：
        1. 教學時間
        2. 教學目標
        3. 教學活動與流程
        4. 教學評量方式
        請以表格方式呈現，並加入創新的教學策略。"""

        # 使用 OpenAI API 生成回應
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "你是一位專業的教案設計師，擅長設計創新且實用的教案。"},
                {"role": "user", "content": prompt}
            ]
        )

        # 獲取生成的內容
        lesson_plan = response.choices[0].message.content

        # 創建HTML內容
        html_content = f"""
        <h3>教學活動設計</h3>
        {lesson_plan}
        <p class="reference-only">※ 此教案供參考，請依實際需求調整</p>
        """

        return jsonify({"success": True, "plan": html_content, "html_content": html_content})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/download_docx', methods=['POST'])
def download_docx():
    try:
        data = request.json
        html_content = data.get('html_content', '')

        # 創建一個新的 Word 文檔
        doc = Document()

        # 解析 HTML 內容
        soup = BeautifulSoup(html_content, 'html.parser')

        # 添加標題
        doc.add_heading('教學活動設計', level=1)

        # 將內容添加到文檔中
        for p in soup.find_all(['p', 'table']):
            if p.name == 'table':
                # 處理表格
                table = doc.add_table(rows=1, cols=1)
                table.style = 'Table Grid'
                cell = table.rows[0].cells[0]
                cell.text = p.get_text()
            else:
                # 處理段落
                doc.add_paragraph(p.get_text())

        # 保存到 BytesIO 對象
        f = io.BytesIO()
        doc.save(f)
        f.seek(0)

        return send_file(
            f,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name='lesson_plan.docx'
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)