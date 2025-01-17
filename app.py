from flask import Flask, render_template, request, jsonify, send_file
import os
from openai import OpenAI, OpenAIError
from bs4 import BeautifulSoup
from docx import Document
import io
import logging
import sys

# 設置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize OpenAI client
try:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    client = OpenAI(api_key=api_key)
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {str(e)}")
    raise

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

        logger.info(f"Generating lesson plan for: {subject}, {grade}, {unit}")

        # 建立提示文本
        prompt = f"""請針對以下教學內容，設計一份完整的教案：
        教學領域：{subject}
        實施年級：{grade}
        單元名稱：{unit}
        額外細節：{details}

        請包含以下項目，並以HTML表格方式呈現：
        1. 教學時間
        2. 教學目標
        3. 教學活動與流程
        4. 教學評量方式
        請以表格方式呈現，並加入創新的教學策略。請確保回應是完整的HTML格式。"""

        # the newest OpenAI model is "gpt-4o" which was released May 13, 2024.
        # do not change this unless explicitly requested by the user
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": "你是一位專業的教案設計師，擅長設計創新且實用的教案。請用HTML表格格式回應，確保內容結構完整。"
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )

        # 獲取生成的內容
        lesson_plan = response.choices[0].message.content

        logger.info("Successfully generated lesson plan")

        # 創建HTML內容
        html_content = f"""
        <h3>教學活動設計</h3>
        {lesson_plan}
        <p class="reference-only">※ 此教案供參考，請依實際需求調整</p>
        """

        return jsonify({
            "success": True, 
            "plan": html_content, 
            "html_content": html_content
        })

    except OpenAIError as e:
        error_message = f"OpenAI API error: {str(e)}"
        logger.error(error_message)
        return jsonify({
            "success": False, 
            "error": error_message
        })
    except Exception as e:
        error_message = f"Error generating lesson plan: {str(e)}"
        logger.error(error_message)
        return jsonify({
            "success": False, 
            "error": error_message
        })

@app.route('/download_docx', methods=['POST'])
def download_docx():
    try:
        data = request.json
        html_content = data.get('html_content', '')

        logger.info("Starting document generation")

        # 創建一個新的 Word 文檔
        doc = Document()

        # 解析 HTML 內容
        soup = BeautifulSoup(html_content, 'html.parser')

        # 添加標題
        doc.add_heading('教學活動設計', level=1)

        # 將內容添加到文檔中
        for element in soup.find_all(['p', 'table']):
            if element.name == 'table':
                # 處理表格
                table = doc.add_table(rows=1, cols=1)
                table.style = 'Table Grid'
                cell = table.rows[0].cells[0]
                cell.text = element.get_text()
            else:
                # 處理段落，排除參考提示
                if 'reference-only' not in element.get('class', []):
                    doc.add_paragraph(element.get_text())

        # 保存到 BytesIO 對象
        f = io.BytesIO()
        doc.save(f)
        f.seek(0)

        logger.info("Document generated successfully")

        return send_file(
            f,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name='lesson_plan.docx'
        )

    except Exception as e:
        error_message = f"Error generating Word document: {str(e)}"
        logger.error(error_message)
        return jsonify({"error": error_message}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)