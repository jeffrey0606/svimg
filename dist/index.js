import PQueue from 'p-queue';
import replaceAsync from 'string-replace-async';
import { join, basename, extname, dirname } from 'node:path';
import sharp from 'sharp';
import { access, mkdir } from 'node:fs/promises';
import md5file from 'md5-file';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';

class Queue {
    constructor(options) {
        this.cache = new Map();
        this.queue = new PQueue({ concurrency: options?.concurrency || Infinity });
    }
    enqueue(func, ...args) {
        const cacheKey = `${func.name}|${JSON.stringify(args)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const p = this.queue.add(() => func.apply(null, args));
        this.cache.set(cacheKey, p);
        return p;
    }
}

function getSrcset(images, options) {
    return images
        .map((i) => (options?.pathOnly ? i.path : `${i.path} ${i.width}w`))
        .join(', ');
}

function getComponentAttributes(input) {
    return {
        srcset: getSrcset(input.images),
        srcsetwebp: input.webpImages.length
            ? getSrcset(input.webpImages)
            : undefined,
        srcsetavif: input.avifImages.length
            ? getSrcset(input.avifImages)
            : undefined,
        placeholder: input.placeholder,
        aspectratio: input.aspectRatio,
        placeholdersrc: input.placeholderImage
            ? getSrcset([input.placeholderImage], { pathOnly: true })
            : undefined,
        placeholderwebp: input.placeholderWebp
            ? getSrcset([input.placeholderWebp], { pathOnly: true })
            : undefined,
        placeholderavif: input.placeholderAvif
            ? getSrcset([input.placeholderAvif], { pathOnly: true })
            : undefined,
    };
}

const pathSepPattern = /\\/g;
function stripPrefix(path, prefix) {
    prefix = prefix.replace(pathSepPattern, '/');
    if (!path.startsWith(prefix)) {
        return path;
    }
    return path.substring(prefix.length + (prefix.endsWith('/') ? 0 : 1));
}
function defaultSrcGenerator(path, { inputDir, src }) {
    if (inputDir) {
        path = stripPrefix(path, inputDir);
    }
    if (src && !path.startsWith('/') && /^\/[^\/]/.test(src)) {
        path = '/' + path;
    }
    return path;
}
function pathToUrl(path, options) {
    path = path.replace(pathSepPattern, '/');
    if (!options) {
        return path;
    }
    let { srcGenerator, ...info } = options;
    if (srcGenerator) {
        if (info.outputDir) {
            path = stripPrefix(path, info.outputDir);
        }
        const url = srcGenerator(path, info);
        if (!url) {
            throw new Error(`srcGenerator function returned an empty src for path ${path}`);
        }
        return url;
    }
    return defaultSrcGenerator(path, info);
}

// sharp only supports a very specific list of image formats,
// no point depending on a complete mime type database
function getMimeType(format) {
    switch (format) {
        case 'jpeg':
        case 'png':
        case 'webp':
        case 'avif':
        case 'tiff':
        case 'gif':
            return `image/${format}`;
        case 'svg':
            return 'image/svg+xml';
    }
    return '';
}

function resizeImageToFile(inputFile, options, outputFile) {
    return resizeImage(inputFile, options, outputFile);
}
async function resizeImage(inputFile, options, outputFile) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    let sharpInstance = sharp(inputFile);
    if (options.quality) {
        sharpInstance = sharpInstance.jpeg({
            quality: options.quality,
            force: false,
        }).png({
            quality: options.quality,
            force: false,
        }).webp({
            quality: options.quality,
            force: false,
        }).avif({
            quality: options.quality,
            force: false,
        });
    }
    sharpInstance = sharpInstance.resize(options.width, options.height);
    return outputFile !== undefined ? sharpInstance.toFile(outputFile) : sharpInstance.toBuffer();
}

async function getImageMetadata(inputFile) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    return sharp(inputFile).metadata();
}

const DEFAULT_WIDTHS = [480, 1024, 1920, 2560];
const DEFAULT_WEBP = true;
const DEFAULT_AVIF = true;
const PLACEHOLDER_WIDTH = 64;

async function createPlaceholder(inputFile, queue) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    const [{ format }, blurData] = await Promise.all([
        queue.enqueue(getImageMetadata, inputFile),
        queue.enqueue(resizeImage, inputFile, { width: PLACEHOLDER_WIDTH }),
    ]);
    if (!format) {
        throw new Error('Image format could not be determined');
    }
    const blur64 = blurData.toString('base64');
    const mime = getMimeType(format);
    const href = `data:${mime};base64,${blur64}`;
    return href;
}

function isError(error) {
    return 'code' in error;
}
async function exists(file) {
    if (!file) {
        return false;
    }
    try {
        await access(file, constants.F_OK);
        return true;
    }
    catch (err) {
        if (isError(err) && err.code === 'ENOENT') {
            return false;
        }
        throw err;
    }
}

async function ensureResizeImage(inputFile, outputFile, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputFile) {
        throw new Error('Output file is required');
    }
    let width;
    let height;
    if (await queue.enqueue(exists, outputFile)) {
        ({ width, height } = await queue.enqueue(getImageMetadata, outputFile));
    }
    else {
        ({ width, height } = await queue.enqueue(resizeImageToFile, inputFile, {
            width: options.width,
            quality: options.quality,
        }, outputFile));
    }
    if (!width || !height) {
        throw new Error('Image dimensions could not be determined');
    }
    return {
        path: outputFile,
        width,
        height,
    };
}

async function resizeImageMultiple(inputFile, outputDir, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputDir) {
        throw new Error('Output file is required');
    }
    const widthPaths = options.widths.map((width) => {
        const outFile = options.filenameGenerator({
            width,
            quality: options.quality,
            inputFile,
        });
        if (!outFile) {
            throw new Error('Output filename not provided');
        }
        return {
            path: join(outputDir, outFile),
            width,
        };
    });
    return options?.skipGeneration
        ? widthPaths.map(({ path, width }) => ({
            path,
            width,
            height: Math.round((width / options.aspectRatio + Number.EPSILON) * 100) /
                100,
        }))
        : await Promise.all(widthPaths.map(({ width, path }) => ensureResizeImage(inputFile, path, queue, {
            width,
            quality: options.quality,
        })));
}

function getHash(content) {
    return createHash('md5').update(content).digest('hex');
}

function getOptionsHash(options, length) {
    const hash = getHash(Object.entries(options)
        .map(([k, v]) => `${k}=${v}`)
        .join(','));
    return length ? hash.substring(0, length) : hash;
}

function getProcessImageOptions(imageWidth, options) {
    let widths = options?.widths || DEFAULT_WIDTHS;
    widths = widths.filter((w) => w <= imageWidth);
    if (!widths.length ||
        (imageWidth > Math.max(...widths) && !options?.widths?.length)) {
        // use original width if smaller or larger than all widths
        widths.push(imageWidth);
    }
    const webp = options?.webp ?? DEFAULT_WEBP;
    const avif = options?.avif ?? DEFAULT_AVIF;
    return {
        widths,
        quality: options?.quality,
        webp,
        avif,
    };
}

async function processImage(inputFile, outputDir, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputDir) {
        throw new Error('Output dir is required');
    }
    const [, metadata, fileHash] = await Promise.all([
        (async () => {
            if (!options?.skipGeneration) {
                if (!(await queue.enqueue(exists, outputDir))) {
                    await queue.enqueue(mkdir, outputDir, {
                        recursive: true,
                    });
                }
            }
        })(),
        queue.enqueue(getImageMetadata, inputFile),
        queue.enqueue(md5file, inputFile),
    ]);
    if (!metadata.width || !metadata.height) {
        throw new Error('Image dimensions could not be determined');
    }
    const { skipGeneration, ...restOpts } = options || {};
    const { widths, quality, webp, avif } = getProcessImageOptions(metadata.width, restOpts);
    const filename = basename(inputFile);
    const extension = extname(filename);
    const baseFilename = filename.substring(0, filename.length - extension.length);
    const aspectRatio = metadata.width / metadata.height;
    const [images, webpImages, avifImages] = await Promise.all([
        resizeImageMultiple(inputFile, outputDir, queue, {
            widths,
            quality,
            filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}${extension}`,
            aspectRatio,
            skipGeneration,
        }),
        webp
            ? resizeImageMultiple(inputFile, outputDir, queue, {
                widths,
                quality,
                filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}.webp`,
                aspectRatio,
                skipGeneration,
            })
            : [],
        avif
            ? resizeImageMultiple(inputFile, outputDir, queue, {
                widths,
                quality,
                filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}.avif`,
                aspectRatio,
                skipGeneration,
            })
            : [],
    ]);
    return {
        images,
        webpImages,
        avifImages,
        aspectRatio,
    };
}

function transformImagePath(image, { inputDir, outputDir, src, srcGenerator, }) {
    return {
        ...image,
        path: pathToUrl(image.path, {
            inputDir,
            outputDir,
            src,
            srcGenerator,
        }),
    };
}
async function generateComponentAttributes(options) {
    let { src, queue, inputDir, outputDir, webp, avif, widths, quality, skipGeneration, skipPlaceholder, embedPlaceholder, } = options;
    if (!src) {
        throw new Error("Src is required");
    }
    if (!inputDir) {
        throw new Error("Input dir is required");
    }
    if (!outputDir) {
        throw new Error("Output dir is required");
    }
    if (typeof embedPlaceholder === "undefined") {
        // TODO: change to false with major version
        embedPlaceholder = true;
    }
    queue = queue || new Queue();
    const inputFile = join(inputDir, src);
    const outputDirReal = join(outputDir, dirname(src));
    const [{ images, webpImages, avifImages, aspectRatio }, placeholder, placeholderImages,] = await Promise.all([
        processImage(inputFile, outputDirReal, queue, {
            webp: webp ?? true,
            avif: avif ?? true,
            widths,
            skipGeneration,
            quality,
        }),
        !skipPlaceholder && embedPlaceholder
            ? createPlaceholder(inputFile, queue)
            : undefined,
        !skipPlaceholder && !embedPlaceholder
            ? processImage(inputFile, outputDirReal, queue, {
                webp: webp ?? true,
                avif: avif ?? true,
                widths: [PLACEHOLDER_WIDTH],
                skipGeneration,
                quality,
            })
            : undefined,
    ]);
    return getComponentAttributes({
        images: images.map((i) => transformImagePath(i, options)),
        webpImages: webpImages.map((i) => transformImagePath(i, options)),
        avifImages: avifImages.map((i) => transformImagePath(i, options)),
        placeholder,
        aspectRatio,
        placeholderImage: placeholderImages?.images?.length
            ? transformImagePath(placeholderImages.images[0], options)
            : undefined,
        placeholderWebp: placeholderImages?.webpImages?.length
            ? transformImagePath(placeholderImages.webpImages[0], options)
            : undefined,
        placeholderAvif: placeholderImages?.avifImages?.length
            ? transformImagePath(placeholderImages.avifImages[0], options)
            : undefined,
    });
}

function formatAttribute(attribute, value) {
    if (!attribute || !value) {
        return '';
    }
    return value === true ? attribute : `${attribute}="${value}"`;
}

function tryParseInt(val) {
    return val && /^[0-9]+$/.test(val) ? parseInt(val, 10) : undefined;
}

function parseAttributes(element) {
    if (!element) {
        return {};
    }
    const root = parse(element.replace(/[\r\n]+/g, ' '));
    if (!root?.firstChild) {
        return {};
    }
    const node = root.firstChild;
    if (!node?.attributes) {
        return {};
    }
    return Object.entries(node.attributes).reduce((rv, [attr, val]) => {
        rv[attr] = val === '' ? attr : val; // so empty value attributes can be truthy
        return rv;
    }, {});
}

async function processImageElement(element, queue, options) {
    if (!element) {
        return element;
    }
    const attrs = parseAttributes(element);
    const src = attrs['src'];
    if (!src) {
        return element;
    }
    const width = tryParseInt(attrs['width']);
    const quality = tryParseInt(attrs['quality']);
    const immediate = !!attrs['immediate'];
    const newAttrs = await generateComponentAttributes({
        src,
        queue,
        inputDir: options.inputDir,
        outputDir: options.outputDir,
        webp: options.webp,
        avif: options.avif,
        widths: width ? [width] : undefined,
        quality,
        skipPlaceholder: immediate || undefined,
        srcGenerator: options.srcGenerator,
        embedPlaceholder: options.embedPlaceholder,
    });
    const attrString = Object.entries(newAttrs)
        .map(([attr, val]) => formatAttribute(attr, val))
        .join(' ');
    return element.substring(0, 6) + ' ' + attrString + element.substring(6);
}

/**
 * Image processing Svelte preprocessor
 * for the svimg package
 *
 * @param options Image preprocessor options
 * @returns Svelte preprocessor
 */
function imagePreprocessor(options) {
    const queue = new Queue();
    return {
        async markup({ content }) {
            return {
                code: await replaceAsync(content, /<Image[^>]+>/g, (element) => processImageElement(element, queue, options)),
            };
        },
    };
}

export { Queue, generateComponentAttributes, imagePreprocessor, processImage };
