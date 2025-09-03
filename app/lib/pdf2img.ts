// Working version - loads PDF.js from CDN to avoid module issues
export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

// Extend window type for PDF.js
declare global {
    interface Window {
        pdfjsLib?: any;
    }
}

let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    // Check if already loaded
    if (window.pdfjsLib) {
        return window.pdfjsLib;
    }

    if (loadPromise) {
        return loadPromise;
    }

    isLoading = true;
    console.log('📚 Loading PDF.js from CDN...');

    loadPromise = new Promise((resolve, reject) => {
        // Create script element
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

        script.onload = () => {
            console.log('✅ PDF.js loaded successfully');

            // Set worker source
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                console.log('🔧 Worker source configured');
                isLoading = false;
                resolve(window.pdfjsLib);
            } else {
                isLoading = false;
                loadPromise = null;
                reject(new Error('PDF.js loaded but pdfjsLib not found on window'));
            }
        };

        script.onerror = () => {
            console.error('❌ Failed to load PDF.js from CDN');
            isLoading = false;
            loadPromise = null;
            reject(new Error('Failed to load PDF.js from CDN'));
        };

        // Add to document
        document.head.appendChild(script);
    });

    return loadPromise;
}

export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    console.log('🔍 Starting PDF conversion...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
    });

    // Validate input file
    if (!file) {
        console.error('❌ No file provided');
        return {
            imageUrl: "",
            file: null,
            error: "No file provided"
        };
    }

    if (file.type !== 'application/pdf') {
        console.error('❌ Invalid file type:', file.type);
        return {
            imageUrl: "",
            file: null,
            error: `Invalid file type: ${file.type}. Expected: application/pdf`
        };
    }

    if (file.size === 0) {
        console.error('❌ Empty file');
        return {
            imageUrl: "",
            file: null,
            error: "File is empty"
        };
    }

    try {
        const lib = await loadPdfJs();

        console.log('📄 Reading file buffer...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('✅ File buffer read, size:', arrayBuffer.byteLength);

        console.log('📖 Loading PDF document...');
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        console.log('✅ PDF loaded, pages:', pdf.numPages);

        console.log('📃 Getting first page...');
        const page = await pdf.getPage(1);
        console.log('✅ Page loaded');

        console.log('🖼️ Creating viewport...');
        const viewport = page.getViewport({ scale: 2 }); // Reduced scale for reliability
        console.log('✅ Viewport created:', {
            width: viewport.width,
            height: viewport.height
        });

        console.log('🎨 Creating canvas...');
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            console.error('❌ Failed to get canvas context');
            return {
                imageUrl: "",
                file: null,
                error: "Failed to get canvas context"
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Configure canvas
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        console.log('✅ Canvas configured');

        console.log('🎭 Rendering page...');
        await page.render({ canvasContext: context, viewport }).promise;
        console.log('✅ Page rendered successfully');

        console.log('💾 Creating blob...');
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        console.log('✅ Blob created, size:', blob.size);

                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.png`, {
                            type: "image/png",
                        });

                        const imageUrl = URL.createObjectURL(blob);
                        console.log('🎉 Conversion completed successfully!');

                        resolve({
                            imageUrl,
                            file: imageFile,
                        });
                    } else {
                        console.error('❌ Failed to create blob');
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image blob",
                        });
                    }
                },
                "image/png",
                0.95 // Slightly lower quality for better compatibility
            );
        });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('❌ Conversion failed:', errorMessage, err);
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${errorMessage}`
        };
    }
}

// Utility to clean up blob URLs
export function cleanupBlobUrl(url: string): void {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

