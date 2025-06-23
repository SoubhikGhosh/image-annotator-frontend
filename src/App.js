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

    return (
        <div style={styles.app}>
            <header style={styles.header}>
                <h1 onClick={navigateToList} style={{cursor: 'pointer'}}>Image Labeling Tool</h1>
            </header>
            <main style={styles.main}>
                {page === 'taskList' && <TaskListPage onStartLabeling={navigateToWorkspace} />}
                {page === 'labeling' && currentTask && <LabelingWorkspace task={currentTask} onBack={navigateToList} />}
            </main>
        </div>
    );
}

// --- PAGES ---

function TaskListPage({ onStartLabeling }) {
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
            
            // *** FIX: Check for non-ok response and show backend error message ***
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to download file.');
            }
            
            // Get the filename from the Content-Disposition header
            const disposition = response.headers.get('content-disposition');
            let filename = `task_${taskId}_annotations.xlsx`; // a default filename
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

    if (isLoading) return <div>Loading tasks...</div>;
    if (error) return <div style={{color: 'red'}}>Error: {error}</div>;

    return (
        <div style={styles.taskListContainer}>
            <h2>Tasks</h2>
            <UploadTask onTaskUploaded={handleTaskUploaded} />
            <div style={styles.taskList}>
                {tasks.length === 0 && <p>No tasks found. Upload a new one to get started.</p>}
                {tasks.map(task => (
                    <div key={task.id} style={styles.taskItem}>
                        <div style={styles.taskInfo}>
                            <strong>{task.name}</strong>
                            <span style={{...styles.status, ...styles[task.status]}}>{task.status}</span>
                        </div>
                        <div style={styles.taskActions}>
                             {(task.status === 'ready' || task.status === 'in_progress') && <button onClick={() => onStartLabeling(task)}>Start Labeling</button>}
                             {task.status === 'completed' && <button onClick={() => onStartLabeling(task)}>View</button>}
                             {/* *** CHANGE: Allow export for ready, in_progress, and completed tasks *** */}
                             {(task.status === 'ready' || task.status === 'in_progress' || task.status === 'completed') && (
                                <button onClick={() => handleExport(task.id)}>Export to Excel</button>
                             )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LabelingWorkspace({ task, onBack }) {
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
                // Fetch all necessary data in parallel
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
                
                // Add the full URL to each image for rendering
                const imagesWithUrls = imagesData.map(img => ({ ...img, url: `${API_URL}/api/images/${img.id}` }));
                setImages(imagesWithUrls);
                
                if (imagesWithUrls.length > 0) {
                    setSelectedImage(imagesWithUrls[0]);
                }
                
                setLabels(labelsData);

                // Group annotations by image ID for easy lookup
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

    if (isLoading) return <div>Loading workspace...</div>;
    if (error) return <div style={{color: 'red'}}>Error: {error}</div>;

    return (
        <div style={styles.workspaceContainer}>
            <button onClick={onBack} style={styles.backButton}>&larr; Back to Tasks</button>
            <div style={styles.workspaceLayout}>
                <ImageListPanel
                    images={images}
                    selectedImageId={selectedImage?.id}
                    onSelectImage={setSelectedImage}
                    annotations={annotations}
                />
                {selectedImage ? (
                    <LabelingCanvas
                        key={selectedImage.id} // Add key to force re-mount on image change
                        image={selectedImage}
                        labels={labels}
                        existingAnnotations={annotations[selectedImage.id] || []}
                        onAnnotationSave={handleAnnotationSave}
                        onLabelCreate={handleLabelCreate}
                    />
                ) : (
                    <div style={styles.canvasContainer}>This task has no images to label.</div>
                )}
            </div>
        </div>
    );
}

// --- COMPONENTS ---

function UploadTask({ onTaskUploaded }) {
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
            if (response.status !== 202) throw new Error('Upload failed');
            const newTask = await response.json();
            onTaskUploaded(newTask);
            setFile(null);
            document.querySelector('input[type="file"]').value = '';
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={styles.uploadForm}>
            <input type="file" accept=".zip" onChange={handleFileChange} disabled={isUploading} />
            <button type="submit" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload New Task"}
            </button>
        </form>
    );
}

function ImageListPanel({ images, selectedImageId, onSelectImage, annotations }) {
    return (
        <div style={styles.imageListPanel}>
            <h4>Images ({images.length})</h4>
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
    );
}

function LabelingCanvas({ image, labels, existingAnnotations, onAnnotationSave, onLabelCreate }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [newBox, setNewBox] = useState(null);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [showLabelSelector, setShowLabelSelector] = useState(false);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        // Scale mouse coordinates to match canvas resolution if display size is different
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Required for cross-domain images
        img.src = image.url;
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            
            existingAnnotations.forEach(ann => {
                ctx.strokeStyle = '#2ecc71';
                ctx.lineWidth = 2;
                const { x, y, width, height } = ann.bounding_box;
                ctx.strokeRect(x, y, width, height);
            });
            
            if (newBox) {
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 2;
                ctx.strokeRect(newBox.x, newBox.y, newBox.width, newBox.height);
            }
        };
        img.onerror = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
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
        if (newBox && newBox.width > 5 && newBox.height > 5) {
             setShowLabelSelector(true);
        } else {
             setNewBox(null);
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
                style={styles.canvas}
            />
            {showLabelSelector && (
                 <LabelSelector
                    labels={labels}
                    onSave={handleSaveAnnotation}
                    onCancel={resetDrawing}
                 />
            )}
        </div>
    );
}

function LabelSelector({ labels, onSave, onCancel }) {
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
                <h4>Select Label</h4>
                
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
                 <a href="#" onClick={(e) => { e.preventDefault(); setIsCreating(!isCreating);}} style={styles.toggleLink}>
                     {isCreating ? 'Select existing' : 'Create new'}
                </a>

                <div style={styles.labelSelectorActions}>
                    <button type="button" onClick={onCancel}>Cancel</button>
                    <button type="submit">Save Annotation</button>
                </div>
            </form>
        </div>
    );
}


// --- STYLES ---

const styles = {
    app: { fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif', color: '#333' },
    header: { backgroundColor: '#2c3e50', color: 'white', padding: '10px 20px', textAlign: 'center' },
    main: { padding: '20px' },
    // Task List
    taskListContainer: { maxWidth: '800px', margin: '0 auto' },
    uploadForm: { marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9', display: 'flex', gap: '10px' },
    taskList: { display: 'flex', flexDirection: 'column', gap: '10px' },
    taskItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' },
    taskInfo: { display: 'flex', alignItems: 'center', gap: '15px' },
    status: { padding: '4px 8px', borderRadius: '12px', color: 'white', fontSize: '12px', textTransform: 'capitalize' },
    processing: { backgroundColor: '#f39c12' },
    ready: { backgroundColor: '#3498db' },
    in_progress: { backgroundColor: '#9b59b6' },
    completed: { backgroundColor: '#2ecc71' },
    failed: { backgroundColor: '#e74c3c' },
    taskActions: { display: 'flex', gap: '10px' },
    // Workspace
    workspaceContainer: { position: 'relative' },
    backButton: { marginBottom: '20px', padding: '8px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' },
    workspaceLayout: { display: 'flex', gap: '20px', border: '1px solid #ccc', borderRadius: '8px', padding: '20px', minHeight: '70vh' },
    imageListPanel: { width: '250px', borderRight: '1px solid #eee', paddingRight: '20px', height: '70vh', overflowY: 'auto' },
    imageListItem: { padding: '10px', cursor: 'pointer', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'},
    selectedImageListItem: { backgroundColor: '#e0eafc', fontWeight: 'bold' },
    checkMark: { color: '#2ecc71', fontWeight: 'bold' },
    canvasContainer: { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: '8px' },
    canvas: { maxWidth: '100%', maxHeight: '70vh', cursor: 'crosshair', objectFit: 'contain' },
    // Label Selector
    labelSelector: { position: 'absolute', top: '20px', right: '20px', backgroundColor: 'white', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', zIndex: 10, width: '250px' },
    labelSelectorActions: { marginTop: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    input: { width: '100%', padding: '8px', boxSizing: 'border-box' },
    select: { width: '100%', padding: '8px' },
    toggleLink: { fontSize: '12px', display: 'block', marginTop: '8px', textAlign: 'right', color: '#3498db' },
};
