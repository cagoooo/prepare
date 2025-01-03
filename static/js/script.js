document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('lesson-plan-form');
    const resultDiv = document.getElementById('result');

    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.style.opacity = '0.5';
        submitButton.style.cursor = 'not-allowed';

        const subject = document.getElementById('subject').value;
        const grade = document.getElementById('grade').value;
        const unit = document.getElementById('unit').value;
        const details = document.getElementById('details').value;

        resultDiv.innerHTML = '<p class="loading">正在生成教案，請稍候...</p>';

        fetch('/generate_plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subject, grade, unit, details }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Parse the HTML content
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.plan, 'text/html');

                // Find the title and apply the new class
                const title = doc.querySelector('h3');
                if (title) {
                    title.classList.add('lesson-plan-title');
                }
                // Set the innerHTML of the resultDiv
                resultDiv.innerHTML = doc.body.innerHTML;

                // Add download button
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '下載 Word 檔案';
                downloadBtn.id = 'downloadBtn';
                downloadBtn.onclick = () => downloadDocx(data.html_content);
                resultDiv.appendChild(downloadBtn);

            } else {
                resultDiv.innerHTML = `<p>生成教案時出錯：${data.error}</p>`;
            }
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        })
        .catch(error => {
            resultDiv.innerHTML = `<p>請求出錯：${error}</p>`;
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        });
    });
});

function downloadDocx(htmlContent) {
    fetch('/download_docx', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html_content: htmlContent }),
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'lesson_plan.docx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error downloading file:', error);
    });
}
