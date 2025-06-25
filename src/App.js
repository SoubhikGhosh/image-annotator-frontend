import React, { useState, useEffect, useRef, useCallback } from 'react';

// Configuration for the backend API URL.
// In a real production app, this would come from an environment variable.
const API_URL = 'http://localhost:8000';

// Main App Component
export default function App() {
    const [page, setPage] = useState('taskList'); // 'taskList' or 'labeling'
    const [currentTask, setCurrentTask] = useState(null);

    const navigateToWorkspace = (task) => {
        setCurrentTask(task);
        setPage('labeling');
    };

    const navigateToList = () => {
        setCurrentTask(null);
        setPage('taskList');
    };

    // This is a dynamic style for the button hover effect
    const handleButtonHover = (e, hover) => {
        if (hover) {
            e.currentTarget.style.backgroundColor = styles.buttonHover.backgroundColor;
            e.currentTarget.style.transform = styles.buttonHover.transform;
        } else {
            // This is a bit tricky as buttons have different initial background colors.
            // We'll reset to a color based on its function, but a CSS class approach would be cleaner.
            if (e.currentTarget.textContent === 'Cancel') {
                 e.currentTarget.style.backgroundColor = styles.buttonSecondary.backgroundColor;
            } else {
                 e.currentTarget.style.backgroundColor = styles.button.backgroundColor;
            }
            e.currentTarget.style.transform = 'none';
        }
    };
    
    // We pass this down to avoid creating functions in a loop
    const buttonProps = {
        onMouseEnter: (e) => handleButtonHover(e, true),
        onMouseLeave: (e) => handleButtonHover(e, false),
    };


    return (
        <div style={styles.app}>
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
        try {
            const response = await fetch(`${API_URL}/api/tasks`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            const data = await response.json();
            setTasks(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        // Set up polling to refresh the tasks list periodically to catch status updates
        const interval = setInterval(fetchTasks, 5000); // Poll every 5 seconds
        return () => clearInterval(interval); // Cleanup on unmount
    }, [fetchTasks]);
    
    const handleTaskUploaded = (newTask) => {
        setTasks(prevTasks => [newTask, ...prevTasks]);
        // Immediately fetch again to get the most up-to-date list
        fetchTasks();
    };
    
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
                if (matches != null && matches[1]) { 
                  filename = matches[1];
                }
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
            console.error('Error downloading the file:', error);
            alert(`Could not export: ${error.message}`);
        }
    };

    if (isLoading) return <div style={styles.loadingText}>Loading tasks...</div>;
    if (error) return <div style={styles.errorText}>Error: {error}</div>;

    return (
        <div style={styles.taskListContainer}>
            <h2 style={styles.pageTitle}>Tasks</h2>
            <UploadTask onTaskUploaded={handleTaskUploaded} buttonProps={buttonProps} />
            <div style={styles.taskList}>
                {tasks.length === 0 && <p>No tasks found. Upload a new one to get started.</p>}
                {tasks.map(task => (
                    <div key={task.id} style={styles.taskItem}>
                        <div style={styles.taskInfo}>
                            <strong>{task.name}</strong>
                            <span style={{...styles.status, ...styles[task.status]}}>{task.status.replace('_', ' ')}</span>
                        </div>
                        <div style={styles.taskActions}>
                             {(task.status === 'ready' || task.status === 'in_progress') && <button {...buttonProps} style={styles.button} onClick={() => onStartLabeling(task)}>Start Labeling</button>}
                             {task.status === 'completed' && <button {...buttonProps} style={styles.button} onClick={() => onStartLabeling(task)}>View</button>}
                             {(task.status === 'ready' || task.status === 'in_progress' || task.status === 'completed') && (
                                <button {...buttonProps} style={styles.buttonSecondary} onClick={() => handleExport(task.id)}>Export to Excel</button>
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
    const [annotations, setAnnotations] = useState({}); // { imageId: [...] }
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const [imagesRes, labelsRes, annotationsRes] = await Promise.all([
                    fetch(`${API_URL}/api/tasks/${task.id}/images`),
                    fetch(`${API_URL}/api/labels`),
                    fetch(`${API_URL}/api/tasks/${task.id}/annotations`)
                ]);

                if (!imagesRes.ok) throw new Error('Failed to fetch images');
                if (!labelsRes.ok) throw new Error('Failed to fetch labels');
                if (!annotationsRes.ok) throw new Error('Failed to fetch annotations');
                
                const imagesData = await imagesRes.json();
                const labelsData = await labelsRes.json();
                const annotationsData = await annotationsRes.json();
                
                const imagesWithUrls = imagesData.map(img => ({ ...img, url: `${API_URL}/api/images/${img.id}` }));
                setImages(imagesWithUrls);
                
                if (imagesWithUrls.length > 0) {
                    setSelectedImage(imagesWithUrls[0]);
                }
                
                setLabels(labelsData);

                const annotationsByImage = annotationsData.reduce((acc, ann) => {
                    const imageId = ann.image_id;
                    if (!acc[imageId]) acc[imageId] = [];
                    acc[imageId].push(ann);
                    return acc;
                }, {});
                setAnnotations(annotationsByImage);

            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [task.id]);
    
    const handleAnnotationSave = async (imageId, newAnnotationData) => {
        try {
            const response = await fetch(`${API_URL}/api/images/${imageId}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAnnotationData),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to save annotation');
            }
            const savedAnnotation = await response.json();

            setAnnotations(prev => {
                const imageAnnotations = prev[imageId] ? [...prev[imageId]] : [];
                imageAnnotations.push(savedAnnotation);
                return {...prev, [imageId]: imageAnnotations};
            });
            setImages(prevImages => prevImages.map(img => 
                img.id === imageId ? {...img, status: 'labeled'} : img
            ));
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };
    
    const handleLabelCreate = async (newLabelName) => {
        try {
            const response = await fetch(`${API_URL}/api/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newLabelName }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to create label');
            }
            const newLabel = await response.json();
            setLabels(prev => [...prev, newLabel]);
            return newLabel;
        } catch (err) {
            alert(`Error: ${err.message}`);
            return null;
        }
    };

    if (isLoading) return <div style={styles.loadingText}>Loading workspace...</div>;
    if (error) return <div style={styles.errorText}>Error: {error}</div>;

    return (
        <div style={styles.workspaceContainer}>
            <button onClick={onBack} style={styles.backButton} {...buttonProps}>&larr; Back to Tasks</button>
            <div style={styles.workspaceLayout}>
                <ImageListPanel
                    images={images}
                    selectedImageId={selectedImage?.id}
                    onSelectImage={setSelectedImage}
                    annotations={annotations}
                />
                {selectedImage ? (
                    <LabelingCanvas
                        key={selectedImage.id} 
                        image={selectedImage}
                        labels={labels}
                        existingAnnotations={annotations[selectedImage.id] || []}
                        onAnnotationSave={handleAnnotationSave}
                        onLabelCreate={handleLabelCreate}
                        buttonProps={buttonProps}
                    />
                ) : (
                    <div style={styles.canvasContainer}>This task has no images to label.</div>
                )}
            </div>
        </div>
    );
}

// --- COMPONENTS ---

function UploadTask({ onTaskUploaded, buttonProps }) {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            alert("Please select a ZIP file.");
            return;
        }
        setIsUploading(true);
        
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(`${API_URL}/api/tasks/upload`, {
                method: 'POST',
                body: formData,
            });
            if (response.status !== 202) {
                 const errorData = await response.json().catch(() => ({detail: 'Upload failed with no specific message.'}));
                 throw new Error(errorData.detail || 'Upload failed');
            }
            const newTask = await response.json();
            onTaskUploaded(newTask);
            setFile(null);
            if(document.querySelector('input[type="file"]')) {
              document.querySelector('input[type="file"]').value = '';
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={styles.uploadForm}>
            <input type="file" accept=".zip" onChange={handleFileChange} disabled={isUploading} style={styles.fileInput}/>
            <button type="submit" disabled={isUploading} {...buttonProps} style={styles.button}>
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

function LabelingCanvas({ image, labels, existingAnnotations, onAnnotationSave, onLabelCreate, buttonProps }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [newBox, setNewBox] = useState(null);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [showLabelSelector, setShowLabelSelector] = useState(false);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Adjust for touch events
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        img.src = image.url;
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            
            // Draw existing annotations
            const labelColors = {};
            const getColorForLabel = (labelId) => {
                if (!labelColors[labelId]) {
                    // Simple hash to get a color, not guaranteed to be unique but good enough
                    const hue = (labelId * 47) % 360; 
                    labelColors[labelId] = `hsl(${hue}, 70%, 60%)`;
                }
                return labelColors[labelId];
            };

            existingAnnotations.forEach(ann => {
                ctx.strokeStyle = getColorForLabel(ann.label_id);
                ctx.lineWidth = 4;
                ctx.globalAlpha = 0.8;
                const { x, y, width, height } = ann.bounding_box;
                ctx.strokeRect(x, y, width, height);
            });
            ctx.globalAlpha = 1.0;
            
            // Draw the new box being created
            if (newBox) {
                ctx.strokeStyle = '#00f6d2';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(newBox.x, newBox.y, newBox.width, newBox.height);
                ctx.setLineDash([]);
            }
        };
        img.onerror = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#e0e0e0';
            ctx.textAlign = 'center';
            ctx.font = '16px Inter, sans-serif';
            ctx.fillText('Could not load image.', canvas.width / 2, canvas.height / 2);
        };
    }, [image.url, existingAnnotations, newBox]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleMouseDown = (e) => {
        if (showLabelSelector) return;
        e.preventDefault();
        setIsDrawing(true);
        setStartPoint(getCanvasPoint(e));
        setNewBox(null);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const currentPoint = getCanvasPoint(e);
        const box = {
            x: Math.min(startPoint.x, currentPoint.x),
            y: Math.min(startPoint.y, currentPoint.y),
            width: Math.abs(startPoint.x - currentPoint.x),
            height: Math.abs(startPoint.y - currentPoint.y),
        };
        setNewBox(box);
    };

    const handleMouseUp = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        setIsDrawing(false);
        if (newBox && newBox.width > 10 && newBox.height > 10) { // Increased minimum size
             setShowLabelSelector(true);
        } else {
             setNewBox(null); // Discard tiny boxes
        }
    };
    
    const handleSaveAnnotation = async (labelData) => {
        if (!newBox) return;

        if ('id' in labelData) { // Existing label
            await onAnnotationSave(image.id, { label_id: parseInt(labelData.id, 10), bounding_box: newBox });
        } else { // New label
            const newLabel = await onLabelCreate(labelData.name);
            if (newLabel) {
               await onAnnotationSave(image.id, { label_id: newLabel.id, bounding_box: newBox });
            }
        }
        resetDrawing();
    };
    
    const resetDrawing = () => {
        setShowLabelSelector(false);
        setNewBox(null);
        setIsDrawing(false);
    };

    return (
        <div style={styles.canvasContainer}>
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                style={styles.canvas}
            />
            {showLabelSelector && (
                 <LabelSelector
                    labels={labels}
                    onSave={handleSaveAnnotation}
                    onCancel={resetDrawing}
                    buttonProps={buttonProps}
                 />
            )}
        </div>
    );
}

function LabelSelector({ labels, onSave, onCancel, buttonProps }) {
    const [selectedLabelId, setSelectedLabelId] = useState(labels[0]?.id || '');
    const [newLabelName, setNewLabelName] = useState('');
    const [isCreating, setIsCreating] = useState(labels.length === 0);
    
    useEffect(() => {
        if (labels.length > 0 && !isCreating) {
            setSelectedLabelId(labels[0].id)
        }
    }, [labels, isCreating]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isCreating) {
            if (!newLabelName.trim()) {
                alert("Please enter a label name.");
                return;
            }
            onSave({ name: newLabelName });
        } else {
            if (!selectedLabelId) {
                 alert("Please select a label.");
                 return;
            }
            onSave({ id: selectedLabelId });
        }
    };

    return (
        <div style={styles.labelSelector}>
            <form onSubmit={handleSubmit}>
                <h4 style={styles.labelSelectorTitle}>Select Label</h4>
                
                {isCreating ? (
                     <input
                        type="text"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="New label name..."
                        style={styles.input}
                        autoFocus
                     />
                ) : (
                    <select
                        value={selectedLabelId}
                        onChange={(e) => setSelectedLabelId(e.target.value)}
                        style={styles.select}
                        autoFocus
                    >
                         {labels.map(label => (
                            <option key={label.id} value={label.id}>{label.name}</option>
                         ))}
                    </select>
                )}
                 <a href="#" onClick={(e) => { e.preventDefault(); setIsCreating(!isCreating); setNewLabelName(''); }} style={styles.toggleLink}>
                     {isCreating ? 'Select existing label' : 'Create new label'}
                </a>

                <div style={styles.labelSelectorActions}>
                    <button type="button" onClick={onCancel} {...buttonProps} style={styles.buttonSecondary}>Cancel</button>
                    <button type="submit" {...buttonProps} style={styles.button}>Save Annotation</button>
                </div>
            </form>
        </div>
    );
}

// --- STYLES ---

const styles = {
    // Core App
    app: { 
        fontFamily: 'Inter, "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif', 
        color: '#e0e0e0',
        backgroundColor: '#1a1d21',
        minHeight: '100vh',
    },
    header: { 
        backgroundColor: '#23272c', 
        color: 'white', 
        padding: '1rem 2rem', 
        textAlign: 'center',
        borderBottom: '1px solid #3a3f46'
    },
    headerH1: {
        cursor: 'pointer',
        margin: 0,
        fontSize: '1.5rem',
        fontWeight: '600',
        display: 'inline-block',
        transition: 'color 0.2s ease-in-out',
    },
    main: { 
        padding: '2rem' 
    },
    loadingText: {
        textAlign: 'center',
        padding: '3rem',
        fontSize: '1.2rem',
        color: '#a0a0a0'
    },
    errorText: {
        textAlign: 'center',
        padding: '3rem',
        fontSize: '1.2rem',
        color: '#e74c3c'
    },

    // Buttons
    button: {
        backgroundColor: '#00a896',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 18px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
    },
    buttonSecondary: {
        backgroundColor: '#4a4f56',
        color: '#e0e0e0',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 18px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
    },
    buttonHover: { // Not directly used in style attr, but for logic
        backgroundColor: '#007f71',
        transform: 'translateY(-2px)'
    },

    // Page Title
    pageTitle: {
        fontSize: '2rem',
        fontWeight: '700',
        marginBottom: '1.5rem',
        color: 'white',
        borderBottom: '2px solid #00a896',
        paddingBottom: '0.5rem',
        display: 'inline-block',
    },
    
    // Task List Page
    taskListContainer: { 
        maxWidth: '900px', 
        margin: '0 auto' 
    },
    uploadForm: { 
        marginBottom: '2rem', 
        padding: '1.5rem', 
        border: '1px solid #3a3f46', 
        borderRadius: '12px', 
        backgroundColor: '#23272c', 
        display: 'flex', 
        gap: '1rem',
        alignItems: 'center'
    },
    fileInput: {
        color: '#e0e0e0',
        fontSize: '14px'
    },
    taskList: { 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem' 
    },
    taskItem: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1.5rem', 
        border: '1px solid #3a3f46', 
        borderRadius: '12px',
        backgroundColor: '#23272c',
        transition: 'all 0.2s ease-in-out',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    taskInfo: { 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem' 
    },
    status: { 
        padding: '6px 12px', 
        borderRadius: '16px', 
        color: 'white', 
        fontSize: '12px', 
        fontWeight: '600',
        textTransform: 'capitalize',
        letterSpacing: '0.5px'
    },
    processing: { backgroundColor: '#f39c12' },
    ready: { backgroundColor: '#3498db' },
    in_progress: { backgroundColor: '#8e44ad' },
    completed: { backgroundColor: '#27ae60' },
    failed: { backgroundColor: '#c0392b' },
    taskActions: { 
        display: 'flex', 
        gap: '0.75rem' 
    },

    // Workspace Page
    workspaceContainer: { 
        position: 'relative' 
    },
    backButton: { 
        marginBottom: '1.5rem', 
        padding: '10px 18px', 
        cursor: 'pointer', 
        border: '1px solid #4a4f56',
        backgroundColor: 'transparent',
        color: '#e0e0e0',
        borderRadius: '6px',
        fontWeight: '600',
        transition: 'all 0.2s ease-in-out',
    },
    workspaceLayout: { 
        display: 'flex', 
        gap: '1.5rem', 
        border: '1px solid #3a3f46', 
        borderRadius: '12px', 
        padding: '1.5rem', 
        minHeight: '75vh',
        backgroundColor: '#23272c',
    },
    imageListPanel: { 
        width: '280px', 
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
    },
    panelTitle: {
        margin: '0 0 1rem 0',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #3a3f46',
        color: '#a0a0a0',
        fontSize: '0.9rem',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    imageList: {
        overflowY: 'auto',
        height: 'calc(75vh - 80px)', // Adjust based on layout padding and title height
        paddingRight: '10px' // For scrollbar
    },
    imageListItem: { 
        padding: '12px 15px', 
        cursor: 'pointer', 
        borderRadius: '8px', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        whiteSpace: 'nowrap', 
        overflow: 'hidden', 
        textOverflow: 'ellipsis',
        marginBottom: '0.5rem',
        transition: 'background-color 0.2s ease',
        border: '1px solid transparent',
    },
    selectedImageListItem: { 
        backgroundColor: 'rgba(0, 168, 150, 0.2)', 
        color: '#ffffff',
        fontWeight: '600',
        border: '1px solid #00a896',
    },
    checkMark: { 
        color: '#27ae60', 
        fontWeight: 'bold',
        fontSize: '1.2rem',
    },
    canvasContainer: { 
        flex: 1, 
        position: 'relative', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#1a1d21', 
        borderRadius: '8px',
        overflow: 'hidden'
    },
    canvas: { 
        maxWidth: '100%', 
        maxHeight: 'calc(75vh - 3rem)', // Match workspace padding
        cursor: 'crosshair', 
        objectFit: 'contain',
        borderRadius: '4px',
    },
    
    // Label Selector Modal
    labelSelector: { 
        position: 'absolute', 
        top: '20px', 
        right: '20px', 
        backgroundColor: '#2c3035', 
        padding: '1.5rem', 
        border: '1px solid #4a4f56', 
        borderRadius: '12px', 
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)', 
        zIndex: 10, 
        width: '280px',
        animation: 'fadeIn 0.2s ease-out'
    },
    labelSelectorTitle: {
        margin: '0 0 1rem 0',
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: 600
    },
    labelSelectorActions: { 
        marginTop: '1.5rem', 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '0.75rem' 
    },
    input: { 
        width: '100%', 
        padding: '10px', 
        boxSizing: 'border-box',
        backgroundColor: '#1a1d21',
        border: '1px solid #4a4f56',
        borderRadius: '6px',
        color: '#e0e0e0',
        fontSize: '14px'
    },
    select: { 
        width: '100%', 
        padding: '10px',
        backgroundColor: '#1a1d21',
        border: '1px solid #4a4f56',
        borderRadius: '6px',
        color: '#e0e0e0',
        fontSize: '14px'
    },
    toggleLink: { 
        fontSize: '13px', 
        display: 'block', 
        marginTop: '10px', 
        textAlign: 'right', 
        color: '#00a896',
        textDecoration: 'none',
        transition: 'color 0.2s'
    },
};
