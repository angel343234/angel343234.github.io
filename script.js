/* ==========================================
   SCRIPT2DIAG — MAIN SCRIPT
   ========================================== */

(() => {
    'use strict';

    // ── DOM References ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const codeEditor = $('#codeEditor');
    const lineNumbers = $('#lineNumbers');
    const mermaidOutput = $('#mermaidOutput');
    const previewViewport = $('#previewViewport');
    const previewContent = $('#previewContent');
    const statusDot = $('#statusDot');
    const statusText = $('#statusText');
    const charCount = $('#charCount');
    const zoomLabel = $('#zoomLabel');
    const errorBar = $('#errorBar');
    const errorText = $('#errorText');
    const selectMermaidTheme = $('#selectMermaidTheme');
    const bgColorPicker = $('#bgColorPicker');
    const diagramNameInput = $('#diagramName');
    const confirmModal = $('#confirmModal');

    // ── State ──
    let renderTimeout = null;
    let zoom = 1;
    let panX = 0, panY = 0;
    let isPanning = false;
    let panStartX, panStartY;
    let isFullscreen = false;
    let renderCounter = 0;

    // ── Templates ──
    const templates = {
        flowchart: `flowchart TD
    A[🚀 Inicio] --> B{¿Decisión?}
    B -->|Sí| C[Proceso A]
    B -->|No| D[Proceso B]
    C --> E[📦 Resultado]
    D --> E
    E --> F((Fin))

    style A fill:#6c5ce7,stroke:#a855f7,color:#fff
    style F fill:#06b6d4,stroke:#0891b2,color:#fff`,

        sequence: `sequenceDiagram
    actor U as 👤 Usuario
    participant F as 🖥️ Frontend
    participant A as ⚙️ API
    participant D as 🗄️ Base de Datos

    U->>F: Solicitud
    F->>A: GET /api/datos
    A->>D: Query SQL
    D-->>A: Resultados
    A-->>F: JSON Response
    F-->>U: Mostrar datos

    Note over F,A: Comunicación HTTPS`,

        class: `classDiagram
    class Animal {
        +String nombre
        +int edad
        +comer() void
        +dormir() void
    }
    class Perro {
        +String raza
        +ladrar() void
    }
    class Gato {
        +String color
        +maullar() void
    }

    Animal <|-- Perro
    Animal <|-- Gato`,

        state: `stateDiagram-v2
    [*] --> Inactivo
    Inactivo --> Procesando : Iniciar
    Procesando --> Completado : Éxito
    Procesando --> Error : Fallo
    Error --> Procesando : Reintentar
    Error --> [*] : Cancelar
    Completado --> [*]

    state Procesando {
        [*] --> Validando
        Validando --> Ejecutando
        Ejecutando --> [*]
    }`,

        er: `erDiagram
    USUARIO ||--o{ PEDIDO : realiza
    PEDIDO ||--|{ DETALLE : contiene
    PRODUCTO ||--o{ DETALLE : incluido_en
    USUARIO {
        int id PK
        string nombre
        string email
        date registro
    }
    PEDIDO {
        int id PK
        date fecha
        float total
    }
    PRODUCTO {
        int id PK
        string nombre
        float precio
    }`,

        gantt: `gantt
    title Cronograma del Proyecto
    dateFormat  YYYY-MM-DD
    section Planificación
        Requisitos       :a1, 2024-01-01, 10d
        Diseño           :a2, after a1, 15d
    section Desarrollo
        Backend          :b1, after a2, 20d
        Frontend         :b2, after a2, 25d
    section Testing
        Pruebas          :c1, after b2, 10d
        Deploy           :c2, after c1, 5d`,

        pie: `pie title Distribución de Tecnologías
    "JavaScript" : 35
    "Python" : 25
    "Java" : 15
    "Go" : 10
    "Rust" : 8
    "Otros" : 7`,

        mindmap: `mindmap
  root((Proyecto))
    Diseño
      UI/UX
      Wireframes
      Prototipos
    Desarrollo
      Frontend
        React
        CSS
      Backend
        Node.js
        API REST
    Testing
      Unitarios
      Integración
    Deploy
      CI/CD
      Monitoreo`,

        blank: ``
    };

    // ── Initialize Mermaid ──
    function initMermaid(theme = 'default') {
        const config = {
            startOnLoad: false,
            securityLevel: 'loose',
            fontFamily: "'Inter', sans-serif",
            flowchart: { htmlLabels: false, curve: 'basis' },
            sequence: { actorMargin: 80, mirrorActors: false, useMaxWidth: false },
            gantt: { useMaxWidth: false }
        };

        if (theme === 'dark') {
            config.theme = 'base';
            config.themeVariables = {
                background: '#0d1117',
                primaryColor: '#21263d',
                primaryTextColor: '#e2e8f0',
                primaryBorderColor: '#475569',
                lineColor: '#8ca6f9',
                secondaryColor: '#282f42',
                tertiaryColor: '#151b2b',
                nodeBorder: '#475569',
                clusterBkg: '#181f2f',
                clusterBorder: '#475569',
                edgeLabelBackground: '#0d1117',
                textColor: '#e2e8f0'
            };
        } else {
            config.theme = theme;
        }

        mermaid.initialize(config);
    }

    // ── Render Diagram ──
    async function renderDiagram() {
        const code = codeEditor.value.trim();

        if (!code) {
            mermaidOutput.innerHTML = `
                <div style="color: var(--text-muted); text-align: center; padding: 60px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;">◈</div>
                    <div style="font-size: 0.9rem; font-weight: 500;">Escribe código Mermaid para ver tu diagrama</div>
                    <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.6;">Usa las plantillas de arriba para comenzar rápidamente</div>
                </div>`;
            setStatus('ready');
            hideError();
            return;
        }

        setStatus('rendering');
        renderCounter++;
        const currentRender = renderCounter;

        try {
            const id = `mermaid-${Date.now()}`;
            let { svg } = await mermaid.render(id, code);

            // Prevent Mermaid from squishing the diagram to 100% viewport width
            const temp = document.createElement('div');
            temp.innerHTML = svg;
            const svgEl = temp.querySelector('svg');
            if (svgEl) {
                const viewBox = svgEl.getAttribute('viewBox');
                if (viewBox) {
                    const vbParts = viewBox.split(' ');
                    const w = parseFloat(vbParts[2]);
                    const h = parseFloat(vbParts[3]);
                    if (w && h) {
                        svgEl.style.width = w + 'px';
                        svgEl.style.height = h + 'px';
                        svgEl.setAttribute('width', w);
                        svgEl.setAttribute('height', h);
                    }
                }
                svgEl.style.maxWidth = 'none';
                svg = temp.innerHTML;
            }

            if (currentRender !== renderCounter) return; // Stale render

            mermaidOutput.innerHTML = svg;
            mermaidOutput.style.opacity = '0';
            requestAnimationFrame(() => {
                mermaidOutput.style.opacity = '1';
            });

            setStatus('success');
            hideError();
        } catch (err) {
            if (currentRender !== renderCounter) return;

            const errorMsg = err.message || String(err);
            const cleanError = errorMsg
                .replace(/Syntax error in text[\s\S]*/, 'Error de sintaxis en el código Mermaid')
                .replace(/mermaid version [\d.]+/, '')
                .substring(0, 200);

            showError(cleanError);
            setStatus('error');

            // Remove any leftover parse error elements
            const errDiv = document.getElementById(`d${id}`);
            if (errDiv) errDiv.remove();
        }
    }

    // ── Status Management ──
    function setStatus(status) {
        statusDot.className = 'status-dot';
        switch (status) {
            case 'ready':
                statusText.textContent = 'Listo';
                break;
            case 'rendering':
                statusDot.classList.add('rendering');
                statusText.textContent = 'Renderizando...';
                break;
            case 'success':
                statusText.textContent = 'Diagrama renderizado';
                break;
            case 'error':
                statusDot.classList.add('error');
                statusText.textContent = 'Error de sintaxis';
                break;
        }
    }

    function showError(msg) {
        errorText.textContent = msg;
        errorBar.classList.add('visible');
    }

    function hideError() {
        errorBar.classList.remove('visible');
    }

    // ── Line Numbers ──
    function updateLineNumbers() {
        const lines = codeEditor.value.split('\n').length;
        let nums = '';
        for (let i = 1; i <= lines; i++) {
            nums += i + '\n';
        }
        lineNumbers.textContent = nums;
        charCount.textContent = `${codeEditor.value.length} caracteres`;
    }

    // ── Debounced Render ──
    function scheduleRender() {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderDiagram, 400);
    }

    // ── Zoom & Pan ──
    function updateTransform() {
        previewContent.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function zoomToPoint(zoomDir, originX, originY) {
        const zoomDelta = zoomDir > 0 ? 0.15 : -0.15;
        const newZoom = Math.max(0.05, Math.min(zoom + zoomDelta, 20));
        if (newZoom !== zoom) {
            panX = originX - (originX - panX) * (newZoom / zoom);
            panY = originY - (originY - panY) * (newZoom / zoom);
            zoom = newZoom;
            updateTransform();
        }
    }

    function zoomIn() {
        const rect = previewViewport.getBoundingClientRect();
        zoomToPoint(1, rect.width / 2, rect.height / 2);
    }

    function zoomOut() {
        const rect = previewViewport.getBoundingClientRect();
        zoomToPoint(-1, rect.width / 2, rect.height / 2);
    }

    function zoomReset() {
        zoom = 1;
        panX = 0;
        panY = 0;
        updateTransform();
    }

    // Mouse wheel zoom
    previewViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = previewViewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        zoomToPoint(e.deltaY < 0 ? 1 : -1, mouseX, mouseY);
    }, { passive: false });

    // Pan with mouse drag
    previewViewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        previewViewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            previewViewport.style.cursor = 'grab';
        }
    });

    // ── Resize Handle ──
    const resizeHandle = $('#resizeHandle');
    const panelCode = $('#panelCode');
    const editorMain = $('#editorMain');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerRect = editorMain.getBoundingClientRect();
        const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        if (newWidth > 20 && newWidth < 80) {
            panelCode.style.width = `${newWidth}%`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // ── Template Buttons ──
    $$('[data-template]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.template;
            if (templates[key] !== undefined) {
                codeEditor.value = templates[key];
                updateLineNumbers();
                scheduleRender();

                // Visual feedback
                $$('.chip').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });

    // ── Mermaid Theme ──
    selectMermaidTheme.addEventListener('change', () => {
        const t = selectMermaidTheme.value;
        if (t === 'dark') bgColorPicker.value = '#0d1117';
        else if (t === 'forest') bgColorPicker.value = '#eaf0ea';
        else bgColorPicker.value = '#ffffff';
        bgColorPicker.dispatchEvent(new Event('input'));

        initMermaid(t);
        renderDiagram();
    });

    // ── Update Viewport BG ──
    $('#bgColorPicker').addEventListener('input', (e) => {
        previewViewport.style.backgroundColor = e.target.value;
        document.documentElement.style.setProperty('--diagram-bg', e.target.value);
    });

    // Init specific initial styles
    document.documentElement.style.setProperty('--diagram-bg', $('#bgColorPicker').value);

    // ── Theme Toggle ──
    const btnThemeToggle = $('#btnThemeToggle');
    let isDark = true;

    btnThemeToggle.addEventListener('click', () => {
        isDark = !isDark;
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            btnThemeToggle.querySelector('.btn-icon').textContent = '🌙';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            btnThemeToggle.querySelector('.btn-icon').textContent = '☀️';
        }
    });

    // ── Fullscreen Toggle ──
    const btnFullscreen = $('#btnFullscreen');
    const btnExitFullscreen = $('#btnExitFullscreen');

    function enterFullscreen() {
        isFullscreen = true;
        document.body.classList.add('fullscreen-preview');
        btnFullscreen.querySelector('.btn-icon').textContent = '⊗';
    }

    function exitFullscreen() {
        isFullscreen = false;
        document.body.classList.remove('fullscreen-preview');
        btnFullscreen.querySelector('.btn-icon').textContent = '⛶';
    }

    btnFullscreen.addEventListener('click', () => {
        if (isFullscreen) exitFullscreen();
        else enterFullscreen();
    });

    // Exit button (overlay — always visible in fullscreen)
    btnExitFullscreen.addEventListener('click', exitFullscreen);

    // Escape to exit fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFullscreen) {
            exitFullscreen();
        }
    });

    // ── Copy Code ──
    $('#btnCopyCode').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(codeEditor.value);
            statusText.textContent = '¡Código copiado!';
            setTimeout(() => setStatus('ready'), 1500);
        } catch {
            // Fallback for file:// protocol
            codeEditor.select();
            document.execCommand('copy');
            statusText.textContent = '¡Código copiado!';
            setTimeout(() => setStatus('ready'), 1500);
        }
    });

    // ── Clear Code (custom modal instead of confirm) ──
    $('#btnClearCode').addEventListener('click', () => {
        if (!codeEditor.value.trim()) return; // Nothing to clear
        $('#confirmModal').classList.add('visible');
    });

    $('#btnConfirmCancel').addEventListener('click', () => {
        $('#confirmModal').classList.remove('visible');
    });

    $('#btnConfirmOk').addEventListener('click', () => {
        codeEditor.value = '';
        updateLineNumbers();
        renderDiagram();
        $$('.chip').forEach(c => c.classList.remove('active'));
        $('#confirmModal').classList.remove('visible');
        statusText.textContent = 'Código eliminado';
        setTimeout(() => setStatus('ready'), 1500);
    });

    // Close modal on overlay click
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.remove('visible');
        }
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmModal.classList.contains('visible')) {
            confirmModal.classList.remove('visible');
        }
    });

    // ── Dismiss Error ──
    $('#btnDismissError').addEventListener('click', hideError);

    // ── Export PDF ──
    $('#btnExportPDF').addEventListener('click', () => {
        const svgEl = mermaidOutput.querySelector('svg');
        if (!svgEl) {
            showError('No hay diagrama para exportar');
            setTimeout(hideError, 3000);
            return;
        }

        statusText.textContent = 'Generando PDF...';
        setStatus('rendering');

        // Get diagram name
        const fileName = (diagramNameInput.value.trim() || 'Mi Diagrama')
            .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\s\-_]/g, '')
            .replace(/\s+/g, '_');

        const svgClone = svgEl.cloneNode(true);

        let w, h;
        const viewBox = svgClone.getAttribute('viewBox');
        if (viewBox) {
            const vbParts = viewBox.split(' ');
            w = parseFloat(vbParts[2]);
            h = parseFloat(vbParts[3]);
        } else {
            const rect = svgEl.getBoundingClientRect();
            w = rect.width / zoom;
            h = rect.height / zoom;
        }

        if (!w || !h) { w = 800; h = 600; }

        svgClone.setAttribute('width', w);
        svgClone.setAttribute('height', h);
        svgClone.style.maxWidth = 'none';
        svgClone.style.width = w + 'px';
        svgClone.style.height = h + 'px';

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            // Adjust scale dynamically to prevent massive canvases
            let scale = 4;
            const MAX_DIMENSION = 8000;
            if (w * scale > MAX_DIMENSION || h * scale > MAX_DIMENSION) {
                scale = Math.max(1, Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h, 4));
            }

            const canvas = document.createElement('canvas');
            canvas.width = w * scale;
            canvas.height = h * scale;
            const ctx = canvas.getContext('2d');

            // Fill with chosen background color
            ctx.fillStyle = bgColorPicker.value;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            try {
                const { jsPDF } = window.jspdf;

                // Determine orientation
                const isLandscape = canvas.width > canvas.height;
                const orientation = isLandscape ? 'landscape' : 'portrait';

                const pdf = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: 'a4'
                });

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                // Add title
                const titleText = diagramNameInput.value.trim() || 'Mi Diagrama';
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(16);
                pdf.setTextColor(40, 40, 40);
                pdf.text(titleText, pageWidth / 2, 15, { align: 'center' });

                // Calculate image dimensions to fit page with margins
                const margin = 15;
                const titleOffset = 22;
                const footerHeight = 10;
                const maxWidth = pageWidth - (margin * 2);
                const maxHeight = pageHeight - titleOffset - margin - footerHeight;

                const imgRatio = canvas.width / canvas.height;
                let imgWidth = maxWidth;
                let imgHeight = imgWidth / imgRatio;

                if (imgHeight > maxHeight) {
                    imgHeight = maxHeight;
                    imgWidth = imgHeight * imgRatio;
                }

                // Center the image
                const x = (pageWidth - imgWidth) / 2;
                const y = titleOffset;

                const imgData = canvas.toDataURL('image/jpeg', 0.90);
                pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);

                // Footer
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`Generado con Script2Diag — ${new Date().toLocaleDateString('es-MX')}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

                // Save PDF manually to ensure filename is respected in file://
                const pdfBlob = pdf.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                const downloadLink = document.createElement('a');
                downloadLink.href = pdfUrl;
                downloadLink.download = `${fileName}.pdf`;
                document.body.appendChild(downloadLink);
                downloadLink.click();

                // Cleanup
                document.body.removeChild(downloadLink);
                setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);

                statusText.textContent = 'PDF exportado ✓';
                setTimeout(() => setStatus('ready'), 2500);
            } catch (pdfErr) {
                console.error('Error generando PDF:', pdfErr);
                showError('Error al crear el PDF. Detalles en consola.');
                setStatus('error');
            }

            URL.revokeObjectURL(url);
        };

        img.onerror = () => {
            showError('Error al procesar la imagen del diagrama');
            setStatus('error');
            URL.revokeObjectURL(url);
        };

        img.src = url;
    });

    // ── Zoom Buttons ──
    $('#btnZoomIn').addEventListener('click', zoomIn);
    $('#btnZoomOut').addEventListener('click', zoomOut);
    $('#btnZoomReset').addEventListener('click', zoomReset);

    // ── Sync scroll for line numbers ──
    codeEditor.addEventListener('scroll', () => {
        lineNumbers.scrollTop = codeEditor.scrollTop;
    });

    // ── Tab key support in editor ──
    codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeEditor.selectionStart;
            const end = codeEditor.selectionEnd;
            codeEditor.value = codeEditor.value.substring(0, start) + '  ' + codeEditor.value.substring(end);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
            updateLineNumbers();
            scheduleRender();
        }
    });

    // ── Ctrl+S to export PDF ──
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            $('#btnExportPDF').click();
        }
    });

    // ── Main input handler ──
    codeEditor.addEventListener('input', () => {
        updateLineNumbers();
        scheduleRender();
    });

    // ── Initialize ──
    initMermaid('default');

    // Load default template
    codeEditor.value = templates.flowchart;
    updateLineNumbers();
    $$('.chip')[0].classList.add('active');
    renderDiagram();

    // Set initial background color on viewport
    $('#bgColorPicker').dispatchEvent(new Event('input'));

})();
