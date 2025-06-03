class AnnotationApp {
    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error(
                "AnnotationApp: کانتینر هدف برای یادداشت‌برداری یافت نشد:",
                targetContainerSelector
            );
            return; 
        }
        
        this._ensureRelativePosition(); 
        this._initializeProperties();   
        this._initializeStorageKey();   
        this._initializeIcons();        
        
        if (this.targetContainer) {
            this.init();
        }
    }

    _ensureRelativePosition() {
        if (getComputedStyle(this.targetContainer).position === "static") {
            this.targetContainer.style.position = "relative";
        }
    }

    _initializeProperties() {
        this.PAN_MOVE_THRESHOLD = 15; 
        this.HIGHLIGHTER_OPACITY = 0.4; // بازگرداندن شفافیت برای هایلایتر

        this.canvas = null;                     
        this.ctx = null;                        
        this.committedCanvas = null;            
        this.committedCtx = null;               
        this.virtualCanvasContainer = null;     

        this.viewportWidth = 0;     
        this.viewportHeight = 0;    
        this.scrollOffsetX = 0;     
        this.scrollOffsetY = 0;     
        this.totalWidth = 0;        
        this.totalHeight = 0;       

        this.isDrawing = false;             
        this.noteModeActive = false;        
        this.currentTool = "pen";           
        this.currentPath = null;            
        this.drawings = [];                 

        this.penColor = "#000000";
        this.penLineWidth = 1;
        this.highlighterColor = "#FFFF00"; 
        this.highlighterLineWidth = 20;
        this.eraserWidth = 15;

        this.animationFrameRequestId = null;    
        this._boundUpdateVirtualCanvas = this.updateVirtualCanvas.bind(this); 

        this.isPanning = false;             
        this.panStartFinger1 = null;        
        this.panStartFinger2 = null;        
        this.lastPanMidX = null;            
        this.lastPanMidY = null;            
        this.isPotentialTwoFingerTap = false; 
        this.twoFingerTapProcessed = false;   
        this.justUndidWithTap = false;      
    }

    _initializeStorageKey() {
        const baseStorageKey = "pageAnnotations";
        const pageIdentifier = window.location.pathname.replace(
            /[^a-zA-Z0-9_-]/g, 
            "_"
        );
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;
    }

    _initializeIcons() {
        this.icons = {
            pen: '<span class="material-symbols-outlined">stylus_note</span>',
            highlighter: '<span class="material-symbols-outlined">format_ink_highlighter</span>',
            eraser: '<span class="material-symbols-outlined">ink_eraser</span>',
        };
    }

    init() {
        this.createVirtualCanvasContainer(); 
        this.createCanvases();               
        this.createToolbar();                
        this.addEventListeners();            
        this.loadDrawings();                 
        this.updateVirtualCanvas();          
        this.selectTool("pen");              
    }

    createVirtualCanvasContainer() {
        this.virtualCanvasContainer = document.createElement("div");
        Object.assign(this.virtualCanvasContainer.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            pointerEvents: "none", 
            zIndex: "1000",        
            overflow: "hidden"     
        });
        document.body.appendChild(this.virtualCanvasContainer);
    }

    createCanvases() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "annotationCanvas"; 
        Object.assign(this.canvas.style, {
            position: "absolute", 
            top: "0",
            left: "0",
            zIndex: "1000",       
            pointerEvents: "none",
            mixBlendMode: "multiply" 
        });
        this.virtualCanvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        this.committedCanvas = document.createElement("canvas");
        this.committedCtx = this.committedCanvas.getContext("2d");
    }

    _createStyledButton(id, title, innerHTML, className = "tool-button") {
        const button = document.createElement("button");
        button.id = id;
        button.title = title;
        button.className = className;
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    createToolbar() {
        this._createMasterToggleButton(); 
        this._createToolsPanel();         
        this._createToolButtons();        
        this._createSettingsGroups();     
        this._createClearButton();        
        
        this.targetContainer.appendChild(this.toolsPanel); 
        this.updateToolSettingsVisibility(); 
    }

    _createMasterToggleButton() {
        this.masterAnnotationToggleBtn = this._createStyledButton(
            "masterAnnotationToggleBtn",
            "NOTE - فعال/غیرفعال کردن یادداشت‌برداری", 
            "NOTE ✏️", 
            "" 
        );
        Object.assign(this.masterAnnotationToggleBtn.style, {
            top: "5px",
            right: "5px"
        });
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);
    }

    _createToolsPanel() {
        this.toolsPanel = document.createElement("div");
        this.toolsPanel.id = "annotationToolsPanel"; 
        Object.assign(this.toolsPanel.style, {
            display: "none", 
            flexDirection: "column", 
            top: "45px", 
            right: "5px"
        });
    }

    _createToolButtons() {
        const toolsGroup = document.createElement("div");
        toolsGroup.className = "toolbar-group"; 

        this.penBtn = this._createStyledButton("penBtn", "قلم", this.icons.pen);
        this.highlighterBtn = this._createStyledButton("highlighterBtn", "هایلایتر", this.icons.highlighter);
        this.eraserBtn = this._createStyledButton("eraserBtn", "پاک‌کن", this.icons.eraser);
        
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);
    }

    _createSettingsGroups() {
        this._createPenSettings();
        this._createHighlighterSettings();
    }

    _createPenSettings() {
        const penSettingsGroup = document.createElement("div");
        penSettingsGroup.className = "toolbar-group setting-group";
        penSettingsGroup.id = "penSettingsGroup"; 

        const penColorLabel = document.createElement("label");
        this.penColorPicker = document.createElement("input");
        this.penColorPicker.type = "color";
        this.penColorPicker.value = this.penColor;
        this.penColorPicker.title = "انتخاب رنگ قلم";

        const penWidthLabel = document.createElement("label");
        this.penLineWidthInput = document.createElement("input");
        Object.assign(this.penLineWidthInput, {
            type: "number",
            value: this.penLineWidth,
            min: "1",
            max: "20",
            title: "تنظیم ضخامت قلم"
        });

        penSettingsGroup.append(penColorLabel, this.penColorPicker, penWidthLabel, this.penLineWidthInput);
        this.toolsPanel.appendChild(penSettingsGroup);
    }

    _createHighlighterSettings() {
        const highlighterSettingsGroup = document.createElement("div");
        highlighterSettingsGroup.className = "toolbar-group setting-group";
        highlighterSettingsGroup.id = "highlighterSettingsGroup";

        const highlighterColorLabel = document.createElement("label");
        this.highlighterColorPicker = document.createElement("input");
        this.highlighterColorPicker.type = "color";
        this.highlighterColorPicker.value = this.highlighterColor;
        this.highlighterColorPicker.title = "انتخاب رنگ هایلایتر";

        const highlighterWidthLabel = document.createElement("label");
        this.highlighterLineWidthInput = document.createElement("input");
        Object.assign(this.highlighterLineWidthInput, {
            type: "number",
            value: this.highlighterLineWidth,
            min: "5",
            max: "50",
            title: "تنظیم ضخامت هایلایتر"
        });

        highlighterSettingsGroup.append(highlighterColorLabel, this.highlighterColorPicker, highlighterWidthLabel, this.highlighterLineWidthInput);
        this.toolsPanel.appendChild(highlighterSettingsGroup);
    }

    _createClearButton() {
        this.clearBtn = this._createStyledButton(
            "clearAnnotationsBtn",
            "پاک کردن تمام یادداشت‌ها و هایلایت‌ها",
            "پاک کردن همه",
            "" 
        );
        this.clearBtn.id = "clearAnnotationsBtn"; 
        this.toolsPanel.appendChild(this.clearBtn);
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById("penSettingsGroup");
        const highlighterSettings = document.getElementById("highlighterSettingsGroup");

        if (penSettings) {
            penSettings.style.display = 
                (this.currentTool === "pen" && this.noteModeActive) ? "flex" : "none";
        }
        if (highlighterSettings) {
            highlighterSettings.style.display = 
                (this.currentTool === "highlighter" && this.noteModeActive) ? "flex" : "none";
        }
    }

    updateVirtualCanvas() {
        const dimensionsChanged = this._calculateAndUpdateDimensions();
        
        if (dimensionsChanged) {
            this._resizeCanvases(); 
        }
        
        this.renderVisibleCanvasRegion(); 
    }

    _calculateAndUpdateDimensions() {
        const oldViewportWidth = this.viewportWidth;
        const oldViewportHeight = this.viewportHeight;
        const oldScrollX = this.scrollOffsetX;
        const oldScrollY = this.scrollOffsetY;
        const oldTotalWidth = this.totalWidth;
        const oldTotalHeight = this.totalHeight;

        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;
        this.scrollOffsetX = window.pageXOffset || document.documentElement.scrollLeft;
        this.scrollOffsetY = window.pageYOffset || document.documentElement.scrollTop;
        
        this.totalWidth = Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
            this.targetContainer.scrollWidth 
        );
        this.totalHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            this.targetContainer.scrollHeight 
        );

        return oldViewportWidth !== this.viewportWidth || 
               oldViewportHeight !== this.viewportHeight ||
               oldScrollX !== this.scrollOffsetX ||
               oldScrollY !== this.scrollOffsetY ||
               oldTotalWidth !== this.totalWidth ||
               oldTotalHeight !== this.totalHeight;
    }

    _resizeCanvases() {
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
        this.canvas.style.width = `${this.viewportWidth}px`; 
        this.canvas.style.height = `${this.viewportHeight}px`;

        if (this.committedCanvas.width !== this.totalWidth || 
            this.committedCanvas.height !== this.totalHeight) {
            this.committedCanvas.width = this.totalWidth;
            this.committedCanvas.height = this.totalHeight;
            this.redrawCommittedDrawings(); 
        }
    }

    addEventListeners() {
        window.addEventListener("resize", this._boundUpdateVirtualCanvas);
        window.addEventListener("scroll", this._boundUpdateVirtualCanvas);
        
        this._addTouchEventListeners();
        this._addMouseEventListeners();
        this._addUIEventListeners();
        this._addSettingsEventListeners();
    }

    _addTouchEventListeners() {
        const touchOptions = { passive: false }; 
        this.canvas.addEventListener("touchstart", (e) => this._handleTouchStart(e), touchOptions);
        this.canvas.addEventListener("touchmove", (e) => this._handleTouchMove(e), touchOptions);
        this.canvas.addEventListener("touchend", (e) => this._handleTouchEnd(e), touchOptions);
        this.canvas.addEventListener("touchcancel", (e) => this._handleTouchEnd(e), touchOptions); 
    }

    _handleTouchStart(event) {
        if (!this.noteModeActive) return; 

        if (event.touches.length === 1) {
            this.justUndidWithTap = false; 
            if (!this.isPanning && !this.isPotentialTwoFingerTap) {
                 this.handleDrawingStart(event);
            }
        } else if (event.touches.length === 2) {
            event.preventDefault(); 
            this.isDrawing = false; 
            this.currentPath = null; 
            this._cancelRenderFrame(); 
            this.renderVisibleCanvasRegion(); 

            this.isPotentialTwoFingerTap = true; 
            this.twoFingerTapProcessed = false;  
            this.isPanning = false;              
            this.justUndidWithTap = false;       

            const t1 = event.touches[0];
            const t2 = event.touches[1];
            this.panStartFinger1 = { clientX: t1.clientX, clientY: t1.clientY };
            this.panStartFinger2 = { clientX: t2.clientX, clientY: t2.clientY };
            
            this.lastPanMidX = (t1.clientX + t2.clientX) / 2;
            this.lastPanMidY = (t1.clientY + t2.clientY) / 2;
        } else {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
            if (event.touches.length > 1) { 
                 this.isDrawing = false; 
            }
        }
    }

    _handleTouchMove(event) {
        if (!this.noteModeActive) return;

        if (event.touches.length === 2 && (this.isPotentialTwoFingerTap || this.isPanning)) {
            event.preventDefault();
            const t1 = event.touches[0];
            const t2 = event.touches[1];
            const currentMidX = (t1.clientX + t2.clientX) / 2;
            const currentMidY = (t1.clientY + t2.clientY) / 2;

            if (this.isPotentialTwoFingerTap) {
                const initialMidX = (this.panStartFinger1.clientX + this.panStartFinger2.clientX) / 2;
                const initialMidY = (this.panStartFinger1.clientY + this.panStartFinger2.clientY) / 2;
                const deltaFromStartSq = Math.pow(currentMidX - initialMidX, 2) + Math.pow(currentMidY - initialMidY, 2);

                if (deltaFromStartSq > Math.pow(this.PAN_MOVE_THRESHOLD, 2)) {
                    this.isPanning = true;
                    this.isPotentialTwoFingerTap = false; 
                    this.isDrawing = false; 
                    this.lastPanMidX = currentMidX;
                    this.lastPanMidY = currentMidY;
                }
            }

            if (this.isPanning) {
                const deltaScrollX = currentMidX - this.lastPanMidX; 
                const deltaScrollY = currentMidY - this.lastPanMidY;

                window.scrollBy(-deltaScrollX, -deltaScrollY); 

                this.lastPanMidX = currentMidX;
                this.lastPanMidY = currentMidY;
            }
        } else if (this.isDrawing && event.touches.length === 1 && !this.isPanning && !this.isPotentialTwoFingerTap) {
            this.handleDrawingMove(event);
        } else if (event.touches.length !== 2 && (this.isPotentialTwoFingerTap || this.isPanning)) {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
        }
    }

    _handleTouchEnd(event) {
        if (!this.noteModeActive) return;

        if (this.isPotentialTwoFingerTap && !this.isPanning && !this.twoFingerTapProcessed) {
            this.undoLastDrawing();
            this.justUndidWithTap = true;     
            this.twoFingerTapProcessed = true; 
            this.isDrawing = false;            
            this.isPotentialTwoFingerTap = false; 
        }
        
        if (this.isDrawing && !this.isPanning && !this.isPotentialTwoFingerTap && event.touches.length === 0) {
             this.handleDrawingEnd(event); 
        }

        if (event.touches.length === 0) {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
            this.isDrawing = false; 
            this.panStartFinger1 = null;
            this.panStartFinger2 = null;
            this.lastPanMidX = null;
            this.lastPanMidY = null;
            this.justUndidWithTap = false;
        } else if (event.touches.length === 1 && (this.isPanning || this.isPotentialTwoFingerTap || this.twoFingerTapProcessed )) {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
        }
    }
    
    undoLastDrawing() {
        if (this.drawings.length > 0) {
            this.drawings.pop(); 
            this.redrawCommittedDrawings(); 
            this.renderVisibleCanvasRegion(); 
            this.saveDrawings(); 
            console.log("AnnotationApp: آخرین یادداشت بازگردانده شد.");
        }
    }

    _addMouseEventListeners() {
        this.canvas.addEventListener("mousedown", (e) => this.handleDrawingStart(e));
        this.canvas.addEventListener("mousemove", (e) => this.handleDrawingMove(e));
        this.canvas.addEventListener("mouseup", (e) => this.handleDrawingEnd(e));
        this.canvas.addEventListener("mouseleave", (e) => this.handleDrawingEnd(e, true));
    }

    _addUIEventListeners() {
        this.masterAnnotationToggleBtn.addEventListener("click", () => this.toggleMasterAnnotationMode());
        this.penBtn.addEventListener("click", () => this.selectTool("pen"));
        this.highlighterBtn.addEventListener("click", () => this.selectTool("highlighter"));
        this.eraserBtn.addEventListener("click", () => this.selectTool("eraser"));
        this.clearBtn.addEventListener("click", () => this.clearAllAnnotations());
    }

    _addSettingsEventListeners() {
        this.penColorPicker.addEventListener("input", (e) => {
            this.penColor = e.target.value;
        });
        this.penLineWidthInput.addEventListener("input", (e) => {
            this.penLineWidth = parseInt(e.target.value, 10);
        });
        this.highlighterColorPicker.addEventListener("input", (e) => {
            this.highlighterColor = e.target.value;
        });
        this.highlighterLineWidthInput.addEventListener("input", (e) => {
            this.highlighterLineWidth = parseInt(e.target.value, 10);
        });
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        
        if (this.noteModeActive) {
            this._activateAnnotationMode();
        } else {
            this._deactivateAnnotationMode();
        }
        
        this.updateToolSettingsVisibility(); 
    }

    _activateAnnotationMode() {
        this.canvas.style.pointerEvents = "auto"; 
        document.body.classList.add("annotation-active"); 
        this.targetContainer.classList.add("annotation-active"); 
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (فعال)";
        this.masterAnnotationToggleBtn.classList.add("active");
        this.toolsPanel.style.display = "flex"; 
        if (!this.currentTool) this.selectTool("pen"); 
        console.log("AnnotationApp: حالت یادداشت‌برداری فعال شد.");
    }

    _deactivateAnnotationMode() {
        this.canvas.style.pointerEvents = "none"; 
        document.body.classList.remove("annotation-active");
        this.targetContainer.classList.remove("annotation-active");
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (غیرفعال)";
        this.masterAnnotationToggleBtn.classList.remove("active");
        this.toolsPanel.style.display = "none"; 
        this._resetDrawingStateAndClearLivePath(); 
        console.log("AnnotationApp: حالت یادداشت‌برداری غیرفعال شد.");
    }

    _resetDrawingStateAndClearLivePath() {
        this.isDrawing = false;
        this.currentPath = null;
        this._cancelRenderFrame();
        this.renderVisibleCanvasRegion(); 
    }

    _getEventCoordinates(event) {
        const clientX = event.touches?.[0]?.clientX ?? event.clientX;
        const clientY = event.touches?.[0]?.clientY ?? event.clientY;

        return {
            x: clientX + this.scrollOffsetX,
            y: clientY + this.scrollOffsetY
        };
    }

    handleDrawingStart(event) {
        if (this.justUndidWithTap) {
            return; 
        }
        if (this.isPanning || this.isPotentialTwoFingerTap) return;

        if (!this._shouldHandleDrawingEvent(event)) { 
            return;
        }
        
        event.preventDefault(); 
        this.isDrawing = true;
        const { x, y } = this._getEventCoordinates(event);
        this.currentPath = this._createNewDrawingPath(x, y); 
    }

    _shouldHandleDrawingEvent(event) { 
        return this.noteModeActive && 
               (!event.touches || event.touches.length === 1) && 
               !this.isPanning &&  
               !this.isPotentialTwoFingerTap; 
    }

    _createNewDrawingPath(x, y) {
        const path = { 
            tool: this.currentTool, 
            points: [{ x, y }] 
        };

        switch (this.currentTool) {
            case "pen":
                Object.assign(path, {
                    color: this.penColor,
                    lineWidth: this.penLineWidth,
                    opacity: 1.0 
                });
                break;
            case "highlighter":
                Object.assign(path, {
                    color: this.highlighterColor,
                    lineWidth: this.highlighterLineWidth,
                    opacity: this.HIGHLIGHTER_OPACITY 
                });
                break;
            case "eraser":
                path.lineWidth = this.eraserWidth; 
                break;
        }
        return path;
    }

    handleDrawingMove(event) {
        if (!this.isDrawing || this.isPanning || this.isPotentialTwoFingerTap) return; 
        
        event.preventDefault(); 
        const { x, y } = this._getEventCoordinates(event);

        if (this.currentPath) {
            this._updateCurrentDrawingPath(x, y); 
            this._requestRenderFrameForLivePath(); 
        }
    }

    _updateCurrentDrawingPath(x, y) {
        if (this.currentTool === "highlighter") {
            if (this.currentPath.points.length <= 1) {
                this.currentPath.points.push({ x, y }); 
            } else {
                this.currentPath.points[1] = { x, y }; 
            }
        } else {
            this.currentPath.points.push({ x, y });
        }
    }

    _requestRenderFrameForLivePath() {
        if (this.animationFrameRequestId === null) { 
            this.animationFrameRequestId = requestAnimationFrame(() => {
                this.renderVisibleCanvasRegion(); 
                this.animationFrameRequestId = null; 
            });
        }
    }

    _cancelRenderFrame() {
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    handleDrawingEnd(event, mouseLeftCanvas = false) { 
        if (this.isPanning || this.isPotentialTwoFingerTap) {
            if (mouseLeftCanvas) { 
                this.isPanning = false;
                this.isPotentialTwoFingerTap = false;
            }
            if (!this.isDrawing && mouseLeftCanvas) { 
                 this._resetDrawingStateAndClearLivePath();
            }
            return;
        }

        this._cancelRenderFrame(); 

        if (mouseLeftCanvas && !this.isDrawing) return;

        if (this.isDrawing) {
            this._processAndCommitCompletedPath(); 
            this._resetDrawingStateAndClearLivePath(); 
        }
    }

    _processAndCommitCompletedPath() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;

        switch (this.currentTool) {
            case "highlighter":
                this._finalizeHighlighterPath();
                this.drawings.push(this.currentPath); 
                break;
            case "eraser":
                this.eraseStrokesUnderCurrentPath(); 
                break;
            default: 
                if (this.currentPath.points.length > 1) {
                    this.drawings.push(this.currentPath);
                }
                break;
        }

        this.redrawCommittedDrawings(); 
        this.saveDrawings(); 
    }

    _finalizeHighlighterPath() {
        if (!this.currentPath || this.currentPath.tool !== "highlighter") return;

        const startPoint = this.currentPath.points[0];
        const endPoint = this.currentPath.points.length > 1 
            ? this.currentPath.points[1] 
            : startPoint;

        this.currentPath.points = [startPoint, endPoint]; 
    }

    eraseStrokesUnderCurrentPath() {
        if (!this.currentPath || this.currentPath.points.length === 0 || this.currentPath.tool !== "eraser") return;

        const drawingsToDelete = new Set(); 

        for (const eraserPoint of this.currentPath.points) {
            for (const drawing of this.drawings) {
                if (drawingsToDelete.has(drawing) || drawing.tool === "eraser") continue;

                const collisionThreshold = (drawing.lineWidth / 2) + (this.eraserWidth / 2);
                const shouldDelete = drawing.points.some(pathPoint => {
                    const distance = Math.sqrt(
                        Math.pow(eraserPoint.x - pathPoint.x, 2) +
                        Math.pow(eraserPoint.y - pathPoint.y, 2)
                    );
                    return distance < collisionThreshold; 
                });

                if (shouldDelete) {
                    drawingsToDelete.add(drawing); 
                }
            }
        }

        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(drawing => !drawingsToDelete.has(drawing));
            console.log(`AnnotationApp: ${drawingsToDelete.size} یادداشت پاک شد.`);
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => {
            this._drawSinglePathOnContext(path, this.committedCtx, false); 
        });
    }

    renderVisibleCanvasRegion() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(
                this.committedCanvas,
                this.scrollOffsetX, this.scrollOffsetY, 
                this.viewportWidth, this.viewportHeight, 
                0, 0, 
                this.viewportWidth, this.viewportHeight 
            );
        }

        if (this.currentPath && this.isDrawing) { 
            this._drawSinglePathOnContext(this.currentPath, this.ctx, true);
        }
    }

    _drawSinglePathOnContext(path, context, isLivePathOnViewport = false) {
        if (!path || path.points.length === 0) return; 

        const originalGCO = context.globalCompositeOperation;
        const originalGA = context.globalAlpha;

        this._setupDrawingContextStyle(path, context); 
        
        if (path.tool === "eraser" && !(this.isDrawing && path === this.currentPath)) {
            context.globalCompositeOperation = originalGCO;
            context.globalAlpha = originalGA;
            return;
        }

        this._drawPathPointsOnContext(path, context, isLivePathOnViewport); 
        
        context.globalCompositeOperation = originalGCO; 
        context.globalAlpha = originalGA;               
    }

    _setupDrawingContextStyle(path, context) {
        context.beginPath();
        context.lineCap = "round";
        context.lineJoin = "round";

        let gco = 'source-over'; 
        let alpha = path.opacity !== undefined ? path.opacity : 1.0; 
        let strokeStyle = path.color || '#000000'; 
        let lineWidth = path.lineWidth || 1;       

        if (path.tool === "eraser" && this.isDrawing && path === this.currentPath) {
            strokeStyle = "rgba(200, 0, 0, 0.6)";
            lineWidth = 2;
            alpha = 0.6;
        } else if (path.tool === "highlighter") {
            gco = 'darken'; 
        } else if (path.tool === "pen") {
            // gco برای قلم 'source-over' باقی می‌ماند
        }
        
        context.strokeStyle = strokeStyle;
        context.lineWidth = lineWidth;
        context.globalAlpha = alpha; // این شامل this.HIGHLIGHTER_OPACITY (0.4) برای هایلایتر خواهد بود
        context.globalCompositeOperation = gco;
    }

    _drawPathPointsOnContext(path, context, isLivePathOnViewport) {
        if (path.points.length === 0) return;

        const firstPoint = this._transformPointIfRequired(path.points[0], isLivePathOnViewport);
        context.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < path.points.length; i++) {
            const point = this._transformPointIfRequired(path.points[i], isLivePathOnViewport);
            context.lineTo(point.x, point.y);
        }
        
        context.stroke(); 
    }

    _transformPointIfRequired(point, shouldTransform) {
        if (shouldTransform) { 
            return {
                x: point.x - this.scrollOffsetX,
                y: point.y - this.scrollOffsetY
            };
        }
        return point; 
    }

    selectTool(toolName) {
        this.currentTool = toolName;
        this.updateActiveToolButtonVisuals(); 
        this.updateToolSettingsVisibility();  
        console.log(`AnnotationApp: ابزار "${toolName}" انتخاب شد.`);
    }

    updateActiveToolButtonVisuals() {
        const buttons = [this.penBtn, this.highlighterBtn, this.eraserBtn];
        const toolNames = ["pen", "highlighter", "eraser"];
        
        buttons.forEach((button, index) => {
            if (button) { 
                button.classList.toggle("active", this.currentTool === toolNames[index]);
            }
        });
    }

    clearAllAnnotations() {
        const confirmed = window.confirm("آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟ این عمل قابل بازگشت نیست.");

        if (confirmed) {
            this.drawings = []; 
            localStorage.removeItem(this.storageKey); 
            this.redrawCommittedDrawings(); 
            this.renderVisibleCanvasRegion(); 
            console.log("AnnotationApp: تمام یادداشت‌ها پاک شدند.");
        } else {
            console.log("AnnotationApp: عملیات پاک کردن یادداشت‌ها لغو شد.");
        }
    }

    saveDrawings() {
        try {
            const drawingsToSave = this.drawings.filter(path => path.tool !== "eraser");
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        } catch (error) {
            console.error("AnnotationApp: خطا در ذخیره‌سازی یادداشت‌ها در localStorage:", error);
            console.warn("ممکن است حافظه مرورگر پر باشد یا خطای دیگری رخ داده باشد.");
        }
    }

    loadDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData);
                this._normalizeLoadedDrawingsProperties(); 
                console.log(`AnnotationApp: ${this.drawings.length} یادداشت از localStorage بارگذاری شد.`);
            } catch (error) {
                console.error("AnnotationApp: خطا در پارس کردن یادداشت‌های ذخیره شده از localStorage:", error);
                this.drawings = []; 
                localStorage.removeItem(this.storageKey); 
            }
        } else {
            this.drawings = []; 
            console.log("AnnotationApp: هیچ یادداشت ذخیره‌ شده‌ای برای این صفحه یافت نشد.");
        }
        
        this.redrawCommittedDrawings();   
        this.renderVisibleCanvasRegion(); 
    }

    _normalizeLoadedDrawingsProperties() {
        this.drawings.forEach(path => {
            if (path.opacity === undefined) {
                path.opacity = path.tool === "highlighter" ? this.HIGHLIGHTER_OPACITY : 1.0;
            }
            
            if (path.lineWidth === undefined) {
                switch (path.tool) {
                    case "pen":
                        path.lineWidth = this.penLineWidth; 
                        break;
                    case "highlighter":
                        path.lineWidth = this.highlighterLineWidth;
                        break;
                    default: 
                        path.lineWidth = 1; 
                        break; 
                }
            }
        });
    }

    destroy() {
        console.log("AnnotationApp: در حال تخریب نمونه...");
        window.removeEventListener("resize", this._boundUpdateVirtualCanvas);
        window.removeEventListener("scroll", this._boundUpdateVirtualCanvas);
        
        this._cancelRenderFrame();
        
        if (this.virtualCanvasContainer) {
            this.virtualCanvasContainer.remove(); 
            this.virtualCanvasContainer = null;
        }
        if (this.toolsPanel && this.toolsPanel.parentElement) {
            this.toolsPanel.remove();
            this.toolsPanel = null;
        }
        if (this.masterAnnotationToggleBtn && this.masterAnnotationToggleBtn.parentElement) {
            this.masterAnnotationToggleBtn.remove();
            this.masterAnnotationToggleBtn = null;
        }
        
        this.targetContainer = null;
        this.canvas = null;
        this.ctx = null;
        this.committedCanvas = null;
        this.committedCtx = null;
        this.drawings = [];

        console.log("AnnotationApp: نمونه با موفقیت تخریب شد.");
    }
}

const localCSS = document.createElement("link");
localCSS.rel = "stylesheet";
localCSS.href = "./note.css"; 
document.head.appendChild(localCSS);

const googleFont = document.createElement("link");
googleFont.rel = "stylesheet";
googleFont.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
document.head.appendChild(googleFont);









// ایجاد div مربوط به نوار اسکرول
const progressBar = document.createElement('div');
progressBar.id = 'scroll-progress-bar';
document.body.appendChild(progressBar);

// ایجاد div مربوط به درصد اسکرول
const percentText = document.createElement('div');
percentText.id = 'scroll-percent';
percentText.textContent = '0%';
document.body.appendChild(percentText);

// افزودن استایل لازم با جاوااسکریپت
const style = document.createElement('style');
style.textContent = `
#scroll-progress-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    height: 2px;
    background-color: #4caf50;
    width: 0%;
    z-index: 9999;
    transition: width 0.25s ease-out;
}
#scroll-percent {
    position: fixed;
    bottom: 1px;
    left: 0px;
    box-shadow: inset 0px 0px 1px 1px white;;
    background-color: rgba(0,0,0,0.5);
    color: white;
    padding: 0px 2px;
    border-radius: 4px;
    font-size: 0.7em;
    z-index: 10000;
    font-family: sans-serif;
}
`;
document.head.appendChild(style);

// کنترل اسکرول برای آپدیت درصد و عرض نوار
window.addEventListener("scroll", function () {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrollPercent = Math.round((scrollTop / docHeight) * 100);

    progressBar.style.width = scrollPercent + "%";
    percentText.textContent = scrollPercent + "%";
});