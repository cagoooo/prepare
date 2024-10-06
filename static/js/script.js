document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('lesson-plan-form');
    const resultDiv = document.getElementById('result');

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
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
                resultDiv.innerHTML = data.plan;
            } else {
                resultDiv.innerHTML = `<p>生成教案時出錯：${data.error}</p>`;
            }
        })
        .catch(error => {
            resultDiv.innerHTML = `<p>請求出錯：${error}</p>`;
        });
    });
});
