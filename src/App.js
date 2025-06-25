import React, { useState, useEffect, useRef, useCallback } from 'react';

// Configuration for the backend API URL.
const API_URL = 'http://localhost:8000';

// Main App Component
export default function App() {
    const [page, setPage] = useState('taskList');
    const [currentTask, setCurrentTask] = useState(null);

    const navigateToWorkspace = (task) => {
        setCurrentTask(task);
        setPage('labeling');
    };

    const navigateToList = () => {
        setCurrentTask(null);
        setPage('taskList');
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
                .danger.hover { background-color: #c0392b !important; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            <header style={styles.header}>
                <h1 onClick={navigateToList} style={styles.headerH1}>Image Labeling Tool</h1>
            </header>
            <main style={styles.main}>
                {page === 'taskList' && <TaskListPage onStartLabeling={navigateToWorkspace} buttonProps={buttonProps} />}
                {page === 'labeling' && currentTask && <LabelingWorkspace task={currentTask} onBack={navigateToList} buttonProps={buttonProps} />}
            </main>
        </div>
    );
}

// --- PAGES ---

function TaskListPage({ onStartLabeling, buttonProps }) {
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchTasks = useCallback(async () => {
        // Don't set loading to true here to prevent flicker during polling
        try {
            const response = await fetch(`${API_URL}/api/tasks`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            const data = await response.json();
            setTasks(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false); // Only set loading false once
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 5000); 
        return () => clearInterval(interval);
    }, [fetchTasks]);
    
    const handleExport = async (taskId) => {
        try {
            const response = await fetch(`${API_URL}/api/tasks/${taskId}/export`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to download file.');
            }
            const disposition = response.headers.get('content-disposition');
            let filename = `task_${taskId}_annotations.xlsx`;
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename="([^"]+)"/;
                const matches = filenameRegex.exec(disposition);
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
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            alert(`Could not export: ${error.message}`);
        }
    };

    if (isLoading) return <div style={styles.loadingText}>Loading tasks...</div>;
    if (error) return <div style={styles.errorText}>Error: {error}</div>;

    return (
        <div style={styles.taskListContainer}>
            <h2 style={styles.pageTitle}>Tasks</h2>
            <UploadTask onTaskUploaded={fetchTasks} buttonProps={buttonProps} />
            <div style={styles.taskList}>
                {tasks.length === 0 && <p>No tasks found. Upload a new one to get started.</p>}
                {tasks.map(task => (
                    <div key={task.id} style={styles.taskItem}>
                        <div style={styles.taskInfo}>
                            <strong>{task.name}</strong>
                            <span style={{...styles.status, ...styles[task.status]}}>{task.status.replace(/_/g, ' ')}</span>
                        </div>
                        <div style={styles.taskActions}>
                             {(task.status === 'ready' || task.status === 'in_progress') && <button {...buttonProps} className="button primary" style={styles.button} onClick={() => onStartLabeling(task)}>Start Labeling</button>}
                             {task.status === 'completed' && <button {...buttonProps} className="button primary" style={styles.button} onClick={() => onStartLabeling(task)}>View</button>}
                             {(task.status === 'ready' || task.status === 'in_progress' || task.status === 'completed') && (
                                <button {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}} onClick={() => handleExport(task.id)}>Export to Excel</button>
                             )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LabelingWorkspace({ task, onBack, buttonProps }) {
    const [images, setImages] = useState([]);
    const [labels, setLabels] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [annotations, setAnnotations] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [imagesRes, labelsRes, annotationsRes] = await Promise.all([
                fetch(`${API_URL}/api/tasks/${task.id}/images`),
                fetch(`${API_URL}/api/labels`),
                fetch(`${API_URL}/api/tasks/${task.id}/annotations`)
            ]);
            if (!imagesRes.ok || !labelsRes.ok || !annotationsRes.ok) throw new Error('Failed to fetch workspace data.');
            
            const [imagesData, labelsData, annotationsData] = await Promise.all([imagesRes.json(), labelsRes.json(), annotationsRes.json()]);
            
            const imagesWithUrls = imagesData.map(img => ({ ...img, url: `${API_URL}/api/images/${img.id}` }));
            setImages(imagesWithUrls);

            if (imagesWithUrls.length > 0) {
                const currentSelectedExists = selectedImage && imagesWithUrls.some(i => i.id === selectedImage.id);
                if (!currentSelectedExists) {
                    setSelectedImage(imagesWithUrls[0]);
                }
            } else {
                setSelectedImage(null);
            }
            
            setLabels(labelsData);

            setAnnotations(annotationsData.reduce((acc, ann) => {
                const imageId = ann.image_id;
                if (!acc[imageId]) acc[imageId] = [];
                acc[imageId].push(ann);
                return acc;
            }, {}));
        } catch (err) { setError(err.message); } finally { setIsLoading(false); }
    }, [task.id]);

    useEffect(() => {
        setIsLoading(true);
        fetchData();
    }, [fetchData]);

    const handleAnnotationUpdate = (imageId, updatedAnnotations) => {
        setAnnotations(prev => ({ ...prev, [imageId]: updatedAnnotations }));
        // Also refetch all data to get latest task statuses from the backend
        fetchData(); 
    };

    if (isLoading) return <div style={styles.loadingText}>Loading workspace...</div>;
    if (error) return <div style={styles.errorText}>Error: {error}</div>;

    return (
        <div style={styles.workspaceContainer}>
            <button onClick={onBack} {...buttonProps} className="button secondary" style={{...styles.button, ...styles.backButton}}>&larr; Back to Tasks</button>
            <div style={styles.workspaceLayout}>
                <ImageListPanel images={images} selectedImageId={selectedImage?.id} onSelectImage={setSelectedImage} annotations={annotations} />
                <div style={styles.mainPanel}>
                    {selectedImage ? (
                        <LabelingCanvas
                            key={selectedImage.id}
                            image={selectedImage}
                            labels={labels}
                            existingAnnotations={annotations[selectedImage.id] || []}
                            onAnnotationUpdate={handleAnnotationUpdate}
                            buttonProps={buttonProps}
                        />
                    ) : (
                        <div style={styles.canvasContainer}>{images.length > 0 ? 'Select an image to start labeling' : 'This task has no images.'}</div>
                    )}
                </div>
                 <LabelManager labels={labels} onLabelsUpdate={fetchData} buttonProps={buttonProps} />
            </div>
        </div>
    );
}

// --- COMPONENTS ---

function UploadTask({ onTaskUploaded, buttonProps }) {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) { alert("Please select a ZIP file."); return; }
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch(`${API_URL}/api/tasks/upload`, { method: 'POST', body: formData });
            if (!response.ok) throw new Error((await response.json()).detail || 'Upload failed');
            onTaskUploaded();
            setFile(null);
            fileInputRef.current.value = '';
        } catch (err) { alert(`Error: ${err.message}`); } finally { setIsUploading(false); }
    };

    return (
        <form onSubmit={handleSubmit} style={styles.uploadForm}>
            <input type="file" accept=".zip" onChange={handleFileChange} disabled={isUploading} ref={fileInputRef} style={{ display: 'none' }} id="file-upload"/>
            <button type="button" {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary, flexShrink: 0}} onClick={() => fileInputRef.current.click()} disabled={isUploading}>
                Choose File
            </button>
            {file && <span style={styles.fileName}>{file.name}</span>}
            <button type="submit" disabled={isUploading || !file} {...buttonProps} className="button primary" style={{...styles.button, marginLeft: 'auto'}}>
                {isUploading ? "Uploading..." : "Upload New Task"}
            </button>
        </form>
    );
}

function ImageListPanel({ images, selectedImageId, onSelectImage, annotations }) {
    return (
        <div style={styles.imageListPanel}>
            <h4 style={styles.panelTitle}>Images ({images.length})</h4>
            <div style={styles.imageList}>
                {images.map(img => {
                    const isLabeled = (annotations[img.id] && annotations[img.id].length > 0) || img.status === 'labeled';
                    return (
                        <div key={img.id} style={{...styles.imageListItem, ...(img.id === selectedImageId ? styles.selectedImageListItem : {})}} onClick={() => onSelectImage(img)}>
                            <span>{img.original_filename}</span>
                            {isLabeled && <span style={styles.checkMark}>✔</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function LabelingCanvas({ image, labels, existingAnnotations, onAnnotationUpdate, buttonProps }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [newBox, setNewBox] = useState(null);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [showLabelSelector, setShowLabelSelector] = useState(false);
    const [hoveredAnnId, setHoveredAnnId] = useState(null);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY;
        if (clientX === undefined || clientY === undefined) return null;
        return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
    };
    
    const isPointInBox = (point, box) => (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);

    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = image.url;
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
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
                    const labelText = label.name;
                    ctx.font = 'bold 16px Inter, sans-serif';
                    const textMetrics = ctx.measureText(labelText);
                    const textWidth = textMetrics.width;
                    const textHeight = 16;
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fillRect(x, y - textHeight - 4, textWidth + 12, textHeight + 4);
                    ctx.fillStyle = 'white';
                    ctx.fillText(labelText, x + 6, y - 4);
                }

                if(isHovered) {
                    const deleteIconSize = 24;
                    ctx.fillStyle = '#ff4757';
                    ctx.fillRect(x + width - deleteIconSize, y, deleteIconSize, deleteIconSize);
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.font = 'bold 16px Inter';
                    ctx.strokeText('X', x + width - 17, y + 17);
                }
            });
            if (newBox) {
                ctx.strokeStyle = '#00f6d2'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
                ctx.strokeRect(newBox.x, newBox.y, newBox.width, newBox.height);
                ctx.setLineDash([]);
            }
        };
        img.onerror = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillText('Could not load image.', canvas.width / 2, canvas.height / 2); };
    }, [image.url, existingAnnotations, newBox, hoveredAnnId, labels]);

    useEffect(() => { draw(); }, [draw]);

    const handleAnnotationDelete = async (annotationId) => {
        if (!window.confirm("Are you sure you want to delete this annotation?")) return;
        try {
            const response = await fetch(`${API_URL}/api/annotations/${annotationId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to delete annotation');
            const updated = existingAnnotations.filter(a => a.id !== annotationId);
            onAnnotationUpdate(image.id, updated);
        } catch(err) { alert(`Error: ${err.message}`); }
    };
    
    const handleMouseDown = (e) => {
        if (showLabelSelector) return;
        e.preventDefault();
        const point = getCanvasPoint(e);
        if (hoveredAnnId) {
            const ann = existingAnnotations.find(a => a.id === hoveredAnnId);
            const {x, y, width} = ann.bounding_box;
            const deleteButton = { x: x + width - 24, y: y, width: 24, height: 24 };
            if (isPointInBox(point, deleteButton)) {
                handleAnnotationDelete(hoveredAnnId);
                return;
            }
        }
        setIsDrawing(true);
        setStartPoint(point);
        setNewBox(null);
    };

    const handleMouseMove = (e) => {
        e.preventDefault();
        const currentPoint = getCanvasPoint(e);
        if (!currentPoint) return;
        if (isDrawing) {
            const box = { x: Math.min(startPoint.x, currentPoint.x), y: Math.min(startPoint.y, currentPoint.y), width: Math.abs(startPoint.x - currentPoint.x), height: Math.abs(startPoint.y - currentPoint.y) };
            setNewBox(box);
        } else if (!showLabelSelector) {
            const annOnTop = existingAnnotations.slice().reverse().find(a => isPointInBox(currentPoint, a.bounding_box));
            setHoveredAnnId(annOnTop ? annOnTop.id : null);
        }
    };

    const handleMouseUp = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        setIsDrawing(false);
        if (newBox && newBox.width > 10 && newBox.height > 10) setShowLabelSelector(true);
        else setNewBox(null);
    };
    
    const handleSaveAnnotation = async (labelData) => {
        if (!newBox) return;
        try {
            const response = await fetch(`${API_URL}/api/images/${image.id}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label_id: labelData.id, bounding_box: newBox }),
            });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to save annotation');
            const savedAnnotation = await response.json();
            onAnnotationUpdate(image.id, [...existingAnnotations, savedAnnotation]);
        } catch (err) { alert(`Error: ${err.message}`); } finally { resetDrawing(); }
    };
    
    const resetDrawing = () => { setShowLabelSelector(false); setNewBox(null); setIsDrawing(false); };

    return (
        <div style={styles.canvasContainer}>
            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => {setHoveredAnnId(null); setIsDrawing(false);}} style={styles.canvas} />
            {showLabelSelector && ( <LabelSelector labels={labels} onSave={handleSaveAnnotation} onCancel={resetDrawing} buttonProps={buttonProps} /> )}
        </div>
    );
}

function LabelSelector({ labels, onSave, onCancel, buttonProps }) {
    const [selectedLabelId, setSelectedLabelId] = useState(labels[0]?.id || '');
    useEffect(() => { if (labels.length > 0 && !selectedLabelId) setSelectedLabelId(labels[0].id) }, [labels, selectedLabelId]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedLabelId) { alert("Please select a label."); return; }
        if (labels.length === 0) { alert("Please create a label first in the 'Manage Labels' panel."); return; }
        onSave({ id: parseInt(selectedLabelId, 10) });
    };

    return (
        <div style={styles.labelSelector}>
            <form onSubmit={handleSubmit}>
                <h4 style={styles.labelSelectorTitle}>Assign Label</h4>
                {labels.length > 0 ? (
                    <select value={selectedLabelId} onChange={(e) => setSelectedLabelId(e.target.value)} style={styles.select} autoFocus>
                        {labels.map(label => (<option key={label.id} value={label.id}>{label.name}</option>))}
                    </select>
                ) : (
                    <p style={{textAlign: 'center', margin: '0 0 1rem 0'}}>No labels available.</p>
                )}
                <div style={styles.labelSelectorActions}>
                    <button type="button" onClick={onCancel} {...buttonProps} className="button secondary" style={{...styles.button, ...styles.buttonSecondary}}>Cancel</button>
                    <button type="submit" {...buttonProps} className="button primary" style={styles.button} disabled={labels.length === 0}>Save</button>
                </div>
            </form>
        </div>
    );
}

function LabelManager({ labels, onLabelsUpdate, buttonProps }) {
    const [newLabelName, setNewLabelName] = useState('');

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newLabelName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/api/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newLabelName }),
            });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to create label');
            setNewLabelName('');
            onLabelsUpdate();
        } catch (err) { alert(`Error: ${err.message}`); }
    };
    
    const handleDelete = async (labelId) => {
        if (!window.confirm("Are you sure you want to delete this label? This cannot be undone.")) return;
        try {
            const response = await fetch(`${API_URL}/api/labels/${labelId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to delete label');
            onLabelsUpdate();
        } catch (err) { alert(`Error: ${err.message}`); }
    };
    
    return (
        <div style={styles.labelManager}>
            <h4 style={styles.panelTitle}>Manage Labels</h4>
            <div style={styles.labelList}>
                {labels.length === 0 && <p style={{fontSize: '14px', color: '#888'}}>No labels created.</p>}
                {labels.map(label => (
                    <div key={label.id} style={styles.labelItem}>
                        <span>{label.name}</span>
                        <button onClick={() => handleDelete(label.id)} style={styles.deleteButton} title={`Delete "${label.name}"`}>&times;</button>
                    </div>
                ))}
            </div>
            <form onSubmit={handleCreate} style={styles.labelCreateForm}>
                <input type="text" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} placeholder="New label name..." style={styles.input} />
                <button type="submit" {...buttonProps} className="button primary" style={{...styles.button, width: '100%'}} disabled={!newLabelName.trim()}>Add Label</button>
            </form>
        </div>
    );
}

// --- STYLES ---
const styles = {
    app: { fontFamily: 'Inter, "Segoe UI", sans-serif', color: '#e0e0e0', backgroundColor: '#1a1d21', minHeight: '100vh' },
    header: { backgroundColor: '#23272c', color: 'white', padding: '1rem 2rem', textAlign: 'center', borderBottom: '1px solid #3a3f46' },
    headerH1: { cursor: 'pointer', margin: 0, fontSize: '1.5rem', fontWeight: 600 },
    main: { padding: '2rem' },
    loadingText: { textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: '#a0a0a0' },
    errorText: { textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: '#e74c3c' },
    button: { backgroundColor: '#00a896', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
    buttonSecondary: { backgroundColor: '#4a4f56' },
    pageTitle: { fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem', color: 'white', borderBottom: '2px solid #00a896', paddingBottom: '0.5rem', display: 'inline-block' },
    taskListContainer: { maxWidth: '900px', margin: '0 auto' },
    uploadForm: { marginBottom: '2rem', padding: '1.5rem', border: '1px solid #3a3f46', borderRadius: '12px', backgroundColor: '#23272c', display: 'flex', gap: '1rem', alignItems: 'center' },
    fileName: { color: '#e0e0e0', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 },
    taskList: { display: 'flex', flexDirection: 'column', gap: '1rem' },
    taskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', border: '1px solid #3a3f46', borderRadius: '12px', backgroundColor: '#23272c' },
    taskInfo: { display: 'flex', alignItems: 'center', gap: '1rem' },
    status: { padding: '6px 12px', borderRadius: '16px', color: 'white', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' },
    processing: { backgroundColor: '#f39c12' }, ready: { backgroundColor: '#3498db' }, in_progress: { backgroundColor: '#8e44ad' }, completed: { backgroundColor: '#27ae60' }, failed: { backgroundColor: '#c0392b' },
    taskActions: { display: 'flex', gap: '0.75rem' },
    workspaceContainer: { position: 'relative' },
    backButton: { marginBottom: '1.5rem', border: '1px solid #4a4f56', backgroundColor: 'transparent' },
    workspaceLayout: { display: 'flex', gap: '1.5rem', border: '1px solid #3a3f46', borderRadius: '12px', padding: '1.5rem', minHeight: '75vh', backgroundColor: '#23272c' },
    imageListPanel: { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column' },
    mainPanel: { flex: 1, display: 'flex', minWidth: 0 },
    panelTitle: { margin: '0 0 1rem 0', paddingBottom: '0.75rem', borderBottom: '1px solid #3a3f46', color: '#a0a0a0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' },
    imageList: { overflowY: 'auto', flex: 1, paddingRight: '10px' },
    imageListItem: { padding: '12px 15px', cursor: 'pointer', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', transition: 'background-color 0.2s ease', border: '1px solid transparent' },
    selectedImageListItem: { backgroundColor: 'rgba(0, 168, 150, 0.2)', color: 'white', fontWeight: 600, border: '1px solid #00a896' },
    checkMark: { color: '#27ae60', fontWeight: 'bold', fontSize: '1.2rem' },
    canvasContainer: { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1d21', borderRadius: '8px', overflow: 'hidden' },
    canvas: { maxWidth: '100%', maxHeight: 'calc(75vh - 3rem)', cursor: 'crosshair', objectFit: 'contain', borderRadius: '4px' },
    labelSelector: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#2c3035', padding: '1.5rem', border: '1px solid #4a4f56', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 10, width: '280px', animation: 'fadeIn 0.2s ease-out' },
    labelSelectorTitle: { margin: '0 0 1rem 0', color: 'white', fontSize: '1.1rem', fontWeight: 600 },
    labelSelectorActions: { marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
    input: { width: '100%', padding: '10px', boxSizing: 'border-box', backgroundColor: '#1a1d21', border: '1px solid #4a4f56', borderRadius: '6px', color: '#e0e0e0', fontSize: '14px' },
    select: { width: '100%', padding: '10px', backgroundColor: '#1a1d21', border: '1px solid #4a4f56', borderRadius: '6px', color: '#e0e0e0', fontSize: '14px' },
    labelManager: { width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid #3a3f46', paddingLeft: '1.5rem' },
    labelList: { flex: 1, overflowY: 'auto' },
    labelItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: '6px', backgroundColor: '#3a3f46', marginBottom: '0.5rem' },
    deleteButton: { backgroundColor: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '24px', height: '24px', fontWeight: 'bold', fontSize: '16px', lineHeight: '24px', transition: 'background-color 0.2s, color 0.2s' },
    labelCreateForm: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #3a3f46' }
};
