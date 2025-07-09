import React, { useState, useEffect, useRef, useCallback } from 'react';

// Configuration for the backend API URL.
const API_URL = 'http://localhost:8000';

// Main App Component
export default function App() {
    const [page, setPage] = useState('dashboard');
    const [currentTask, setCurrentTask] = useState(null);

    const navigateTo = (targetPage, task = null) => {
        setPage(targetPage);
        setCurrentTask(task);
    };
    
    const buttonProps = {
        onMouseEnter: (e) => e.currentTarget.classList.add('hover'),
        onMouseLeave: (e) => e.currentTarget.classList.remove('hover'),
    };

    return (
        <div style={styles.app}>
            <style>{`
                .button { transition: all 0.2s ease-in-out; }
                .button.hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
                .primary.hover { background-color: #008a79 !important; }
                .secondary.hover { background-color: #5a6169 !important; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
            <header style={styles.header}>
                <div style={styles.headerContent}>
                    <img src="/assets/images/logo.png" alt="Logo" style={styles.logo} onClick={() => navigateTo('dashboard')}/>
                    <h1 onClick={() => navigateTo('dashboard')} style={styles.headerH1}></h1>
                    <nav style={styles.nav}>
                        <button onClick={() => navigateTo('dashboard')} style={{...styles.navLink, ...(page === 'dashboard' ? styles.activeNavLink : {})}}>Dashboard</button>
                        <button onClick={() => navigateTo('taskList')} style={{...styles.navLink, ...(page === 'taskList' ? styles.activeNavLink : {})}}>Tasks</button>
                    </nav>
                </div>
            </header>
            <main style={styles.main}>
                {page === 'dashboard' && <DashboardPage onStartLabeling={(task) => navigateTo('labeling', task)} buttonProps={buttonProps}/>}
                {page === 'taskList' && <TaskListPage onStartLabeling={(task) => navigateTo('labeling', task)} buttonProps={buttonProps} />}
                {page === 'labeling' && currentTask && <LabelingWorkspace task={currentTask} onBack={() => navigateTo('taskList')} buttonProps={buttonProps} />}
            </main>
        </div>
    );
}

// --- MODAL COMPONENT ---
function ProcessTaskModal({ task, onClose, buttonProps }) {
    const [labels, setLabels] = useState([]);
    const [selectedLabelIds, setSelectedLabelIds] = useState(new Set());
    const [action, setAction] = useState('blacken');
    const [blurRadius, setBlurRadius] = useState(15);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLabels = async () => {
            try {
                const response = await fetch(`${API_URL}/api/labels`);
                if (!response.ok) throw new Error('Could not fetch labels.');
                setLabels(await response.json());
            } catch (err) {
                setError(err.message);
            }
        };
        fetchLabels();
    }, []);

    const handleLabelToggle = (labelId) => {
        const newSet = new Set(selectedLabelIds);
        if (newSet.has(labelId)) {
            newSet.delete(labelId);
        } else {
            newSet.add(labelId);
        }
        setSelectedLabelIds(newSet);
    };

    const handleDownload = async () => {
        if (selectedLabelIds.size === 0) {
            alert('Please select at least one label.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const payload = { 
                action, 
                label_ids: Array.from(selectedLabelIds),
                blur_radius: parseInt(blurRadius, 10)
            };
            const response = await fetch(`${API_URL}/api/tasks/${task.id}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Failed to process ${action}.`);
            }

            const disposition = response.headers.get('content-disposition');
            let filename = `task_${task.id}_${action}.zip`;
            if (disposition) {
                const matches = /filename="([^"]+)"/.exec(disposition);
                if (matches?.[1]) filename = matches[1];
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            onClose();

        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h3 style={styles.modalTitle}>Process Task: {task.name}</h3>
                
                <div style={styles.modalSection}>
                    <label style={styles.modalLabel}>1. Select Action</label>
                    <div style={styles.radioGroup}>
                        <label><input type="radio" value="blacken" checked={action === 'blacken'} onChange={(e) => setAction(e.target.value)} /> Blacken Boxes</label>
                        <label><input type="radio" value="blur" checked={action === 'blur'} onChange={(e) => setAction(e.target.value)} /> Blur Boxes</label>
                        <label><input type="radio" value="crop" checked={action === 'crop'} onChange={(e) => setAction(e.target.value)} /> Crop Boxes</label>
                    </div>
                    {action === 'blur' && (
                        <div style={styles.sliderContainer}>
                            <label htmlFor="blurRange" style={styles.sliderLabel}>Blur Amount: {blurRadius}</label>
                            <input
                                id="blurRange"
                                type="range"
                                min="1"
                                max="50"
                                value={blurRadius}
                                onChange={(e) => setBlurRadius(e.target.value)}
                                style={styles.slider}
                            />
                        </div>
                    )}
                </div>

                <div style={styles.modalSection}>
                    <label style={styles.modalLabel}>2. Select Labels to Process</label>
                    <div style={styles.checkboxGroup}>
                        {labels.length > 0 ? labels.map(label => (
                            <label key={label.id} style={styles.checkboxLabel}>
                                <input type="checkbox" checked={selectedLabelIds.has(label.id)} onChange={() => handleLabelToggle(label.id)} />
                                {label.name}
                            </label>
                        )) : <p>Loading labels...</p>}
                    </div>
                </div>
                
                {error && <p style={styles.modalError}>{error}</p>}

                <div style={styles.modalActions}>
                    <button onClick={onClose} {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}} disabled={isLoading}>Cancel</button>
                    <button onClick={handleDownload} {...buttonProps} className="button primary" style={styles.button} disabled={isLoading || selectedLabelIds.size === 0}>
                        {isLoading ? 'Processing...' : 'Download ZIP'}
                    </button>
                </div>
            </div>
        </div>
    );
}


// --- DASHBOARD & OTHER PAGES ---
function DashboardPage({ onStartLabeling, buttonProps }) {
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetch(`${API_URL}/api/dashboard-summary`).then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => setStats(data)).catch(() => setError('Could not fetch dashboard data.'))
            .finally(() => setIsLoading(false));
    }, []);
    if (isLoading) return <div style={styles.loadingText}>Loading Dashboard...</div>;
    if (error) return <div style={styles.errorText}>{error}</div>;
    if (!stats) return null;
    return (<div style={styles.dashboardContainer}><div style={styles.statGrid}><StatCard title="Total Tasks" value={stats.total_tasks} /><StatCard title="Total Images" value={stats.total_images} /><StatCard title="Total Annotations" value={stats.total_annotations} /><StatCard title="Total Labels" value={stats.total_labels} /></div><div style={styles.chartsGrid}><ChartCard title="Task Status"><DonutChart data={stats.task_status_counts} /></ChartCard><ChartCard title="Top 5 Labels"><BarChart data={stats.top_labels} /></ChartCard><ChartCard title="Recent Tasks"><RecentTasksList tasks={stats.recent_tasks} onStartLabeling={onStartLabeling} buttonProps={buttonProps}/></ChartCard></div></div>);
}

function TaskListPage({ onStartLabeling, buttonProps }) {
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processingTask, setProcessingTask] = useState(null);
    const fetchTasks = useCallback(async () => {
        try { const response = await fetch(`${API_URL}/api/tasks`); if (!response.ok) throw new Error('Failed to fetch tasks'); setTasks(await response.json()); } catch (err) { setError(err.message); } finally { setIsLoading(false); }
    }, []);
    useEffect(() => { fetchTasks(); const interval = setInterval(fetchTasks, 5000); return () => clearInterval(interval); }, [fetchTasks]);
    
    // --- MODIFIED CODE START (handleDelete function added) ---
    const handleDelete = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task and all its data? This cannot be undone.")) {
            return;
        }
        try {
            const response = await fetch(`${API_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error((await response.json()).detail || 'Failed to delete task.');
            }
            fetchTasks(); // Refresh the list after deleting
        } catch (error) {
            alert(`Could not delete task: ${error.message}`);
        }
    };
    // --- MODIFIED CODE END ---

    // --- MODIFIED CODE START (handleExport updated for different formats) ---
    const handleExport = async (taskId, format) => {
        const endpoint = format === 'yolo'
            ? `${API_URL}/api/tasks/${taskId}/export-yolo`
            : `${API_URL}/api/tasks/${taskId}/export`;

        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to download file.');
            }
            const disposition = response.headers.get('content-disposition');
            let filename = `export.zip`; // Default filename
            if (disposition?.includes('attachment')) {
                const matches = /filename="([^"]+)"/.exec(disposition);
                if (matches?.[1]) filename = matches[1];
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert(`Could not export: ${error.message}`);
        }
    };
    // --- MODIFIED CODE END ---

    if (isLoading) return <div style={styles.loadingText}>Loading tasks...</div>;
    if (error) return <div style={styles.errorText}>Error: {error}</div>;
    return (<>{processingTask && <ProcessTaskModal task={processingTask} onClose={() => setProcessingTask(null)} buttonProps={buttonProps} />}<div style={styles.taskListContainer}><h2 style={styles.pageTitle}>Tasks</h2><UploadTask onTaskUploaded={fetchTasks} buttonProps={buttonProps} /><div style={styles.taskList}>{tasks.map(task => (<div key={task.id} style={styles.taskItem}><div style={styles.taskInfo}><strong>{task.name}</strong><span style={{...styles.status, ...styles[task.status]}}>{task.status.replace(/_/g, ' ')}</span></div>
    {/* --- MODIFIED CODE START (Buttons updated) --- */}
    <div style={styles.taskActions}>
        <button {...buttonProps} className="button primary" style={styles.button} onClick={() => onStartLabeling(task)}>{task.status === 'completed' ? 'View' : 'Label'}</button>
        <button {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}} onClick={() => setProcessingTask(task)}>Process & Download</button>
        <button {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}} onClick={() => handleExport(task.id, 'excel')}>Export to Excel</button>
        <button {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}} onClick={() => handleExport(task.id, 'yolo')}>Export to YOLO</button>
        <button {...buttonProps} className="button secondary" style={{...styles.button, backgroundColor: '#c0392b'}} onClick={() => handleDelete(task.id)}>Delete</button>
    </div>
    {/* --- MODIFIED CODE END --- */}
    </div>))}</div></div></>);
}

function StatCard({ title, value }) { return ( <div style={styles.statCard}><h3 style={styles.statCardTitle}>{title}</h3><p style={styles.statCardValue}>{value}</p></div>); }
function ChartCard({ title, children }) { return ( <div style={styles.chartCard}><h3 style={styles.chartCardTitle}>{title}</h3><div style={styles.chartCardContent}>{children}</div></div>); }
function DonutChart({ data }) { const statusColors = { processing: '#f39c12', ready: '#3498db', in_progress: '#8e44ad', completed: '#27ae60', failed: '#c0392b' }; const total = Object.values(data).reduce((s, v) => s + v, 0); if (total === 0) return <p style={{color: '#888'}}>No data.</p>; let cumulative = 0; const gradients = Object.entries(data).map(([key, value]) => { const p = (value / total) * 100, c = statusColors[key]||'#7f8c8d', s = cumulative; cumulative += p; return `${c} ${s}% ${cumulative}%`; }); return (<div style={styles.donutChartContainer}><div style={{...styles.donut, background: `conic-gradient(${gradients.join(', ')})`}}></div><div style={styles.legend}>{Object.entries(data).map(([key, value]) => (<div key={key} style={styles.legendItem}><span style={{...styles.legendColorBox, backgroundColor: statusColors[key]||'#7f8c8d'}}></span><span>{key.replace(/_/g,' ')} ({value})</span></div>))}</div></div>); }
function BarChart({ data }) { if (!data || data.length === 0) return <p style={{color: '#888'}}>No annotations.</p>; const max = Math.max(...data.map(i => i.count), 0); return (<div style={styles.barChartContainer}>{data.map((item, i) => (<div key={i} style={styles.barRow}><span style={styles.barLabel}>{item.name}</span><div style={styles.barWrapper}><div style={{...styles.bar, width: `${(item.count / max) * 100}%`}}></div></div><span style={styles.barValue}>{item.count}</span></div>))}</div>); }
function RecentTasksList({ tasks, onStartLabeling, buttonProps }) { if (!tasks || tasks.length === 0) return <p style={{color: '#888'}}>No tasks created.</p>; return (<div style={styles.recentTasksContainer}>{tasks.map(task => (<div key={task.id} style={styles.recentTaskItem}><div style={styles.recentTaskInfo}><span style={styles.recentTaskName}>{task.name}</span><span style={{...styles.status, ...styles[task.status]}}>{task.status.replace(/_/g, ' ')}</span></div><button {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary, padding:'5px 10px', fontSize:'12px'}} onClick={() => onStartLabeling(task)}>View</button></div>))}</div>); }

function LabelingWorkspace({ task, onBack, buttonProps }) {
    const [images, setImages] = useState([]);
    const [labels, setLabels] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [annotations, setAnnotations] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            // No longer fetching image files separately, image data is part of the 'images' response
            const [imgRes, lblRes, annRes] = await Promise.all([
                fetch(`${API_URL}/api/tasks/${task.id}/images`),
                fetch(`${API_URL}/api/labels`),
                fetch(`${API_URL}/api/tasks/${task.id}/annotations`)
            ]);

            if (!imgRes.ok || !lblRes.ok || !annRes.ok) {
                throw new Error('Fetch failed.');
            }

            const [imgData, lblData, annData] = await Promise.all([
                imgRes.json(),
                lblRes.json(),
                annRes.json()
            ]);

            // Construct image objects with Base64 data directly
            const imgs = imgData.map(img => ({
                ...img,
                url: `data:image/png;base64,${img.data}` // Prefix Base64 data with data URL scheme
            }));
            setImages(imgs);

            if (imgs.length > 0) {
                if (!selectedImage || !imgs.some(i => i.id === selectedImage.id)) {
                    setSelectedImage(imgs[0]);
                }
            } else {
                setSelectedImage(null);
            }
            setLabels(lblData);
            setAnnotations(annData.reduce((acc, ann) => {
                if (!acc[ann.image_id]) acc[ann.image_id] = [];
                acc[ann.image_id].push(ann);
                return acc;
            }, {}));

        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [task.id, selectedImage]);

    useEffect(() => {
        setIsLoading(true);
        fetchData();
    }, [fetchData]);

    const handleAnnUpdate = (imgId, anns) => {
        setAnnotations(p => ({ ...p, [imgId]: anns }));
        fetchData(); // Re-fetch to ensure task/image statuses are updated
    };

    if (isLoading) return <div style={styles.loadingText}>Loading...</div>;
    if (error) return <div style={styles.errorText}>{error}</div>;

    return (
        <div style={styles.workspaceContainer}>
            <button onClick={onBack} {...buttonProps} className="button secondary" style={{...styles.button, ...styles.backButton}}>&larr; Back</button>
            <div style={styles.workspaceLayout}>
                <ImageListPanel images={images} selectedImageId={selectedImage?.id} onSelectImage={setSelectedImage} annotations={annotations} />
                <div style={styles.mainPanel}>
                    {selectedImage ? (
                        <LabelingCanvas
                            key={selectedImage.id} // Key ensures canvas re-renders when image changes
                            image={selectedImage}
                            labels={labels}
                            existingAnnotations={annotations[selectedImage.id] || []}
                            onAnnotationUpdate={handleAnnUpdate}
                        />
                    ) : (
                        <div style={styles.canvasContainer}>
                            {images.length > 0 ? 'Select an image' : 'No images.'}
                        </div>
                    )}
                </div>
                <LabelManager labels={labels} onLabelsUpdate={fetchData} buttonProps={buttonProps} />
            </div>
        </div>
    );
}

function UploadTask({ onTaskUploaded, buttonProps }) {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file); // FastAPI expects 'file' field for UploadFile

        try {
            const res = await fetch(`${API_URL}/api/tasks/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Upload failed');
            }
            onTaskUploaded(); // Refresh task list
            setFile(null);
            fileInputRef.current.value = ''; // Clear file input
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={styles.uploadForm}>
            <input type="file" accept=".zip" onChange={(e) => setFile(e.target.files[0])} disabled={isUploading} ref={fileInputRef} style={{ display: 'none' }} />
            <button type="button" {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary, flexShrink: 0}} onClick={() => fileInputRef.current.click()} disabled={isUploading}>Choose File</button>
            {file && <span style={styles.fileName}>{file.name}</span>}
            <button type="submit" disabled={isUploading || !file} {...buttonProps} className="button primary" style={{...styles.button, marginLeft: 'auto'}}>{isUploading ? "Uploading..." : "Upload"}</button>
        </form>
    );
}

function ImageListPanel({ images, selectedImageId, onSelectImage, annotations }) {
    return (
        <div style={styles.imageListPanel}>
            <h4 style={styles.panelTitle}>Images ({images.length})</h4>
            <div style={styles.imageList}>
                {images.map(img => {
                    const isLabeled = (annotations[img.id]?.length > 0) || img.status === 'labeled';
                    return (
                        <div
                            key={img.id}
                            style={{...styles.imageListItem, ...(img.id === selectedImageId ? styles.selectedImageListItem : {})}}
                            onClick={() => onSelectImage(img)}
                        >
                            <span>{img.original_filename}</span>
                            {isLabeled && <span style={styles.checkMark}>✔</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function LabelingCanvas({ image, labels, existingAnnotations, onAnnotationUpdate }) { 
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [newBox, setNewBox] = useState(null);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [showLabelSelector, setShowLabelSelector] = useState(false);
    const [hoveredAnnId, setHoveredAnnId] = useState(null);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY;
        if (clientX === undefined) return null;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const isPointInBox = (point, box) => (
        point.x >= box.x && point.x <= box.x + box.width &&
        point.y >= box.y && point.y <= box.y + box.height
    );

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Required for cross-origin images or data URLs
        img.src = image.url; // This now directly contains the Base64 data URL

        img.onload = () => {
            // Set canvas dimensions to natural image dimensions
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas before drawing
            ctx.drawImage(img, 0, 0);

            const labelMap = new Map(labels.map(l => [l.id, l]));

            existingAnnotations.forEach(ann => {
                const isHovered = ann.id === hoveredAnnId;
                const label = labelMap.get(ann.label_id);

                ctx.lineWidth = isHovered ? 5 : 3;
                ctx.strokeStyle = isHovered ? '#ff4757' : '#2ed573';
                
                const { x, y, width, height } = ann.bounding_box;
                ctx.strokeRect(x, y, width, height);

                if (label) {
                    const txt = label.name;
                    ctx.font = 'bold 16px Inter, sans-serif';
                    const m = ctx.measureText(txt);
                    
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fillRect(x, y - 20, m.width + 12, 20);
                    ctx.fillStyle = 'white';
                    ctx.fillText(txt, x + 6, y - 5);
                }

                if(isHovered) {
                    ctx.fillStyle = '#ff4757';
                    ctx.fillRect(x + width - 24, y, 24, 24);
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.font = 'bold 16px Inter';
                    ctx.strokeText('×', x + width - 17, y + 17);
                }
            });

            if (newBox) {
                ctx.strokeStyle = '#00f6d2';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]); // Dashed line for new box
                ctx.strokeRect(newBox.x, newBox.y, newBox.width, newBox.height);
                ctx.setLineDash([]); // Reset line dash
            }
        };

        img.onerror = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '24px Inter, sans-serif';
            ctx.fillStyle = '#e74c3c';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Could not load image.', canvas.width / 2, canvas.height / 2);
        };
        // If image is already loaded (e.g., from cache), call onload directly
        if (img.complete) {
            img.onload();
        }
    }, [image.url, existingAnnotations, newBox, hoveredAnnId, labels]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleDelete = async (annId) => {
        if (!window.confirm("Delete annotation?")) return;
        try {
            const res = await fetch(`${API_URL}/api/annotations/${annId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
            onAnnotationUpdate(image.id, existingAnnotations.filter(a => a.id !== annId));
        } catch(err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        const p = getCanvasPoint(e);
        if (!p || showLabelSelector) return;

        if (hoveredAnnId) {
            const ann = existingAnnotations.find(a => a.id === hoveredAnnId);
            const {x, y, width} = ann.bounding_box;
            // Check if click is on the delete 'x'
            if (isPointInBox(p, { x: x + width - 24, y, width: 24, height: 24 })) {
                handleDelete(hoveredAnnId);
                return;
            }
        }
        setIsDrawing(true);
        setStartPoint(p);
        setNewBox(null); // Clear any previous new box
    };

    const handleMouseMove = (e) => {
        e.preventDefault();
        const p = getCanvasPoint(e);
        if (!p) return;

        if (isDrawing) {
            setNewBox({
                x: Math.min(startPoint.x, p.x),
                y: Math.min(startPoint.y, p.y),
                width: Math.abs(startPoint.x - p.x),
                height: Math.abs(startPoint.y - p.y)
            });
        } else if (!showLabelSelector) {
            // Determine hovered annotation for delete button
            // Iterate from last to first to prioritize annotations drawn last (on top)
            const ann = existingAnnotations.slice().reverse().find(a => isPointInBox(p, a.bounding_box));
            setHoveredAnnId(ann ? ann.id : null);
        }
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        if (newBox?.width > 10 && newBox?.height > 10) { // Require a minimum size for a valid box
            setShowLabelSelector(true);
        } else {
            setNewBox(null); // Discard small boxes
        }
    };

    const handleSave = async (labelData) => {
        if (!newBox) return;
        try {
            const res = await fetch(`${API_URL}/api/images/${image.id}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label_id: labelData.id,
                    bounding_box: newBox
                })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
            onAnnotationUpdate(image.id, [...existingAnnotations, await res.json()]);
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setShowLabelSelector(false);
            setNewBox(null);
        }
    };

    return (
        <div style={styles.canvasContainer}>
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {setHoveredAnnId(null); setIsDrawing(false);}} // Reset hover and drawing on leave
                style={styles.canvas}
            />
            {showLabelSelector && (
                <LabelSelector
                    labels={labels}
                    onSave={handleSave}
                    onCancel={() => {
                        setShowLabelSelector(false);
                        setNewBox(null); // Discard new box if canceled
                    }}
                />
            )}
        </div>
    );
}

function LabelSelector({ labels, onSave, onCancel }) {
    const [selected, setSelected] = useState(labels[0]?.id || '');

    useEffect(() => {
        // Automatically select the first label if none is selected and labels exist
        if (labels.length > 0 && !selected) {
            setSelected(labels[0].id);
        }
    }, [labels, selected]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (labels.length === 0) {
            alert("Please create at least one label first.");
            return;
        }
        if (!selected) {
            alert("Please select a label.");
            return;
        }
        onSave({ id: parseInt(selected, 10) });
    };

    return (
        <div style={styles.labelSelector}>
            <form onSubmit={handleSubmit}>
                <h4 style={styles.labelSelectorTitle}>Assign Label</h4>
                {labels.length > 0 ? (
                    <select value={selected} onChange={(e) => setSelected(e.target.value)} style={styles.select} autoFocus>
                        {labels.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                ) : (
                    <p style={{textAlign:'center', margin:'0 0 1rem 0'}}>No labels available. Please create some in the "Manage Labels" panel.</p>
                )}
                
                <div style={styles.labelSelectorActions}>
                    <button type="button" onClick={onCancel} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}}>Cancel</button>
                    <button type="submit" className="button primary" style={styles.button} disabled={labels.length === 0}>Save</button>
                </div>
            </form>
        </div>
    );
}

function LabelManager({ labels, onLabelsUpdate, buttonProps }) {
    const [name, setName] = useState('');

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Failed to create label');
            }
            setName('');
            onLabelsUpdate(); // Refresh labels list
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this label? This cannot be undone.")) return;
        try {
            const res = await fetch(`${API_URL}/api/labels/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Failed to delete label');
            }
            onLabelsUpdate(); // Refresh labels list
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    return (
        <div style={styles.labelManager}>
            <h4 style={styles.panelTitle}>Manage Labels</h4>
            <div style={styles.labelList}>
                {labels.length === 0 ? <p style={{fontSize:'14px', color:'#888'}}>No labels created yet.</p> : labels.map(l => (
                    <div key={l.id} style={styles.labelItem}>
                        <span>{l.name}</span>
                        <button onClick={() => handleDelete(l.id)} style={styles.deleteButton} title={`Delete "${l.name}"`}>&times;</button>
                    </div>
                ))}
            </div>
            <form onSubmit={handleCreate} style={styles.labelCreateForm}>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="New label name..."
                    style={styles.input}
                />
                <button
                    type="submit"
                    {...buttonProps}
                    className="button primary"
                    style={{...styles.button, width: '100%'}}
                    disabled={!name.trim()}
                >
                    Add
                </button>
            </form>
        </div>
    );
}

// --- STYLES ---
const styles = {
    app: { fontFamily: 'Inter, "Segoe UI", sans-serif', color: '#e0e0e0', backgroundColor: '#1a1d21', minHeight: '100vh' },
    header: { backgroundColor: '#23272c', color: 'white', padding: '0 2rem', borderBottom: '1px solid #3a3f46' },
    headerContent: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', maxWidth: '1400px', margin: '0 auto'},
    logo: { scale: '0.5'},
    headerH1: { cursor: 'pointer', margin: 0, fontSize: '1.5rem', fontWeight: 600 },
    nav: { display: 'flex', gap: '0.5rem' },
    navLink: { backgroundColor: '#23272c', border: 'none', color: '#a0a0a0', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' },
    activeNavLink: { backgroundColor: '#3a3f46', color: 'white', fontWeight: '500' },
    main: { padding: '2rem' },
    loadingText: { textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: '#a0a0a0' },
    errorText: { textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: '#e74c3c' },
    button: { backgroundColor: '#00a896', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
    buttonSecondary: { backgroundColor: '#4a4f56' },
    pageTitle: { fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem', color: 'white', borderBottom: '2px solid #00a896', paddingBottom: '0.5rem', display: 'inline-block' },
    dashboardContainer: { animation: 'fadeIn 0.5s' },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' },
    statCard: { backgroundColor: '#23272c', padding: '1.5rem', borderRadius: '12px', border: '1px solid #3a3f46' },
    statCardTitle: { margin: '0 0 0.5rem 0', color: '#a0a0a0', fontSize: '1rem', fontWeight: 500 },
    statCardValue: { margin: 0, color: 'white', fontSize: '2.5rem', fontWeight: 700 },
    chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' },
    chartCard: { backgroundColor: '#23272c', padding: '1.5rem', borderRadius: '12px', border: '1px solid #3a3f46', display: 'flex', flexDirection: 'column' },
    chartCardTitle: { margin: '0 0 1.5rem 0', color: 'white', fontSize: '1.2rem', fontWeight: 600 },
    chartCardContent: { flex: 1 },
    donutChartContainer: { display: 'flex', alignItems: 'center', gap: '2rem' },
    donut: { width: '140px', height: '140px', borderRadius: '50%', },
    legend: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px' },
    legendColorBox: { width: '14px', height: '14px', borderRadius: '3px' },
    legendText: { textTransform: 'capitalize' },
    barChartContainer: { display: 'flex', flexDirection: 'column', gap: '1rem' },
    barRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
    barLabel: { width: '100px', textAlign: 'right', fontSize: '14px', color: '#a0a0a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    barWrapper: { flex: 1, backgroundColor: '#3a3f46', borderRadius: '4px', height: '24px' },
    bar: { height: '100%', backgroundColor: '#00a896', borderRadius: '4px', transition: 'width 0.5s' },
    barValue: { fontSize: '14px', fontWeight: '600' },
    recentTasksContainer: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    recentTaskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #3a3f46' },
    recentTaskInfo: { display: 'flex', alignItems: 'center', gap: '1rem', overflow: 'hidden' },
    recentTaskName: { fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'},
    taskListContainer: { margin: '0 auto', animation: 'fadeIn 0.5s' },
    uploadForm: { marginBottom: '2rem', padding: '1.5rem', border: '1px solid #3a3f46', borderRadius: '12px', backgroundColor: '#23272c', display: 'flex', gap: '1rem', alignItems: 'center' },
    fileName: { color: '#e0e0e0', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 },
    taskList: { display: 'flex', flexDirection: 'column', gap: '1rem' },
    taskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', border: '1px solid #3a3f46', borderRadius: '12px', backgroundColor: '#23272c' },
    taskInfo: { display: 'flex', alignItems: 'center', gap: '1rem' },
    status: { padding: '6px 12px', borderRadius: '16px', color: 'white', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' },
    processing: { backgroundColor: '#f39c12' }, ready: { backgroundColor: '#3498db' }, in_progress: { backgroundColor: '#8e44ad' }, completed: { backgroundColor: '#27ae60' }, failed: { backgroundColor: '#c0392b' },
    taskActions: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' },
    workspaceContainer: { position: 'relative', animation: 'fadeIn 0.5s' },
    backButton: { marginBottom: '1.5rem', border: '1px solid #4a4f56', backgroundColor: 'transparent' },
    workspaceLayout: { 
        display: 'flex', 
        gap: '1.5rem', 
        border: '1px solid #3a3f46', 
        borderRadius: '12px', 
        padding: '1.5rem', 
        height: '70vh',
        backgroundColor: '#23272c' 
    },
    imageListPanel: { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column' },
    mainPanel: { flex: 1, display: 'flex', minWidth: 0 },
    panelTitle: { margin: '0 0 1rem 0', paddingBottom: '0.75rem', borderBottom: '1px solid #3a3f46', color: '#a0a0a0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' },
    imageList: { overflowY: 'auto', flex: 1, paddingRight: '10px' },
    imageListItem: { padding: '12px 15px', cursor: 'pointer', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', transition: 'background-color 0.2s ease', border: '1px solid transparent' },
    selectedImageListItem: { backgroundColor: 'rgba(0, 168, 150, 0.2)', color: 'white', fontWeight: 600, border: '1px solid #00a896' },
    checkMark: { color: '#27ae60', fontWeight: 'bold', fontSize: '1.2rem' },
    canvasContainer: { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1d21', borderRadius: '8px', overflow: 'hidden' },
    // --- MODIFIED CODE START (Canvas style updated) ---
    canvas: { 
        maxWidth: '100%', 
        maxHeight: '100%', 
        cursor: 'crosshair', 
        objectFit: 'contain', 
        borderRadius: '4px' 
    },
    // --- MODIFIED CODE END ---
    labelSelector: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#2c3035', padding: '1.5rem', border: '1px solid #4a4f56', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 10, width: '280px', animation: 'fadeIn 0.2s ease-out' },
    labelSelectorTitle: { margin: '0 0 1rem 0', color: 'white', fontSize: '1.1rem', fontWeight: 600 },
    labelSelectorActions: { marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
    input: { width: '100%', padding: '10px', boxSizing: 'border-box', backgroundColor: '#1a1d21', border: '1px solid #4a4f56', borderRadius: '6px', color: '#e0e0e0', fontSize: '14px' },
    select: { width: '100%', padding: '10px', backgroundColor: '#1a1d21', border: '1px solid #4a4f56', borderRadius: '6px', color: '#e0e0e0', fontSize: '14px' },
    labelManager: { width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid #3a3f46', paddingLeft: '1.5rem' },
    labelList: { flex: 1, overflowY: 'auto' },
    labelItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: '6px', backgroundColor: '#3a3f46', marginBottom: '0.5rem' },
    deleteButton: { backgroundColor: 'transparent', color: '#aaa', border: 'none', borderRadius: '50%', cursor: 'pointer', width: '24px', height: '24px', fontWeight: 'bold', fontSize: '16px', lineHeight: '24px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'},
    labelCreateForm: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #3a3f46' },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, animation: 'fadeIn 0.3s' },
    modalContent: { backgroundColor: '#2c3035', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '500px', border: '1px solid #4a4f56' },
    modalTitle: { margin: '0 0 1.5rem 0', color: 'white', fontSize: '1.5rem', fontWeight: 600 },
    modalSection: { marginBottom: '1.5rem' },
    modalLabel: { display: 'block', marginBottom: '0.75rem', color: '#a0a0a0', fontWeight: 500 },
    radioGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#e0e0e0' },
    checkboxGroup: { maxHeight: '200px', overflowY: 'auto', border: '1px solid #4a4f56', borderRadius: '6px', padding: '1rem' },
    checkboxLabel: { display: 'block', padding: '0.5rem 0', cursor: 'pointer' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' },
    modalError: { color: '#ff4757', textAlign: 'center' },
    sliderContainer: { marginTop: '1rem' },
    sliderLabel: { display: 'block', marginBottom: '0.5rem', color: '#e0e0e0' },
    slider: { width: '100%', cursor: 'pointer' }
};