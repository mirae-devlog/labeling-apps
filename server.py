"""
VisionLabel Pro — YOLO Python Backend  v2.1
============================================
Jalankan:
    pip install flask flask-cors ultralytics pillow pyyaml
    python server.py

Atau dengan model spesifik:
    python server.py --model models/best.pt --port 5000

Endpoints:
    GET  /status          → health check + model info
    GET  /list_models     → scan folder models/ → list file .pt tersedia
    POST /load_model      → load / hot-swap model .pt baru tanpa restart
    POST /detect          → deteksi 1 gambar
    POST /detect_batch    → deteksi banyak gambar (base64 list)
    GET  /classes         → class names dari model
    POST /validate        → cek jumlah deteksi vs BOM
    GET  /export_yaml     → generate dataset YAML untuk training
    POST /export_labels   → terima labels dari browser, simpan ke disk
"""

import argparse
import base64
import io
import json
import os
import sys
import time
import traceback
from pathlib import Path

import yaml
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

# ──────────────────────────────────────────────────────────────
# APP SETUP
# ──────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ──────────────────────────────────────────────────────────────
# GLOBAL MODEL STATE
# ──────────────────────────────────────────────────────────────
model        = None
model_path   = None
model_name   = None
num_classes  = 0
class_names  = []
device_used  = 'cpu'
load_time_ms = 0

# Default folder to scan for pretrained .pt files
MODELS_DIR = Path('./models')

# ──────────────────────────────────────────────────────────────
# BOM CATALOGUE
# ──────────────────────────────────────────────────────────────
BOM_CATALOGUE = {
    '0K153':       {'cushion_black':2,'hub':1,'rivet_big':16,'damper_sky_blue_long':4,'rivet_small':16,'stopper_pin':8,'damper_black_short':4,'plate_nail_black':4},
    '1KD IMV-71':  {'hub':1,'rivet_big':16,'damper_white_long':4,'cushion_green':2,'rivet_small':16,'damper_white_short':4,'stopper_pin':8,'plate_nail_black':4},
    '2KDH-70715':  {'hub':1,'damper_white_long':4,'rivet_big':16,'cushion_green':2,'rivet_small':16,'damper_white_short':4,'stopper_pin':8,'plate_nail_black':4},
    '71381 H1A':   {'hub':1,'damper_white_long':4,'cushion_green':2,'rivet_big':16,'rivet_small':16,'damper_white_short':4,'stopper_pin':8,'plate_nail_black':4},
    '71491 H2GA':  {'hub':1,'damper_orange_short':4,'rivet_big':16,'damper_blue_long':4,'stopper_pin':8,'rivet_small':16,'cushion_yellow':2,'plate_nail_black':4},
    'DTX-162A':    {'hub':1,'damper_grey_long':8,'rivet_small':8,'rivet_big':8,'stopper_pin':8,'plate_nail_black':4},
    'DTX-164A':    {'hub':1,'rivet_big':16,'damper_white_long':4,'cushion_green':2,'rivet_small':16,'damper_white_short':4,'stopper_pin':8,'plate_nail_black':4},
    'DTX-165A':    {'damper_white_long':4,'damper_white_short':4,'hub':1,'cushion_green':2,'rivet_big':16,'rivet_small':16,'stopper_pin':8,'plate_nail_black':4},
    'DTX-163A':    {'hub':1,'rivet_small':16,'rivet_big':16,'stopper_pin':8,'damper_grey_short':2,'damper_sky_blue_long':2,'cushion_black':2,'plate_nail_black':4},
    'E2RB':        {'hub':1,'damper_white_long':8,'rivet_big':8,'stopper_pin':8,'rivet_small':8,'plate_nail_black':4},
    'EZ0S':        {'hub':1,'damper_red_short':4,'rivet_big':16,'stopper_pin':8,'rivet_small':16,'damper_blue_long':4,'cushion_yellow':2,'plate_nail_black':4},
    'EZ12 1GR':    {'hub':1,'damper_white_long':4,'rivet_big':16,'rivet_small':16,'damper_white_short':4,'cushion_green':2,'stopper_pin':8,'plate_nail_white':4},
    'EZ50-1TRGP':  {'damper_white_long':8,'hub':1,'rivet_big':8,'rivet_small':8,'stopper_pin':8,'plate_nail_black':4},
    'EZ88':        {'damper_white_long':4,'hub':1,'damper_white_short':4,'rivet_big':16,'cushion_green':2,'rivet_small':16,'stopper_pin':8,'plate_nail_black':4},
    'F1A':         {'damper_grey_long':4,'hub':1,'damper_yellow_short':4,'rivet_big':16,'rivet_small':16,'stopper_pin':8,'cushion_grey':2,'plate_nail_black':4},
    'F1B':         {'hub':1,'damper_grey_long':4,'damper_yellow_short':4,'rivet_big':16,'rivet_small':16,'cushion_grey':2,'stopper_pin':8,'plate_nail_black':4},
    'H4':          {'damper_green_long':4,'hub':1,'damper_yellow_short':4,'rivet_big':16,'cushion_yellow':2,'rivet_small':16,'stopper_pin':8,'plate_nail_black':4},
    '2KDL':        {'hub':1,'damper_white_long':8,'rivet_big':8,'rivet_small':8,'stopper_pin':8},
    'TT207':       {'hub':1,'damper_white_long':8,'rivet_big':8,'rivet_small':8,'stopper_pin':8,'plate_nail_black':4},
    '71501-G1A':   {'hub':1,'damper_blue_long':8,'rivet_big':16,'rivet_small':16,'stopper_pin':8,'plate_nail_pink':4},
    'V6':          {'damper_white_long':4,'hub':1,'damper_white_short':4,'rivet_big':16,'cushion_green':2,'rivet_small':16,'stopper_pin':8,'plate_nail_white':4},
    'DTX-161A':    {'hub':1,'damper_grey_long':8,'rivet_big':8,'rivet_small':8,'stopper_pin':8,'plate_nail_black':4},
    'DTX-233A':    {'damper_grey_long':4,'hub':1,'damper_yellow_short':4,'rivet_big':16,'cushion_grey':2,'rivet_small':16,'stopper_pin':8,'plate_nail_black':4},
    '71222':       {'damper_white_long':4,'hub':1,'damper_white_short':4,'rivet_big':16,'cushion_green':2,'rivet_small':16,'stopper_pin':8,'plate_nail_white':4},
    '18KD':        {'hub':1,'damper_white_long':8,'rivet_big':8,'rivet_small':8,'stopper_pin':8,'plate_nail_black':4},
}

ALL_CLASS_NAMES = [
    'hub','rivet_big','rivet_small','stopper_pin',
    'damper_red_long','damper_red_short','damper_blue_long','damper_blue_short',
    'damper_green_long','damper_green_short','damper_white_long','damper_white_short',
    'damper_black_long','damper_black_short','damper_yellow_long','damper_yellow_short',
    'damper_grey_long','damper_grey_short','cushion_yellow','cushion_green',
    'cushion_white','cushion_black','cushion_grey','damper_sky_blue_long',
    'plate_nail_black','plate_nail_white','plate_nail_pink','damper_orange_short',
]

# ──────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────

def load_model_fn(path: str):
    from ultralytics import YOLO
    import torch

    global model, model_path, model_name, num_classes, class_names, device_used, load_time_ms

    path = path.strip()
    if not os.path.exists(path):
        raise FileNotFoundError(f"File tidak ditemukan: '{path}'")

    t0 = time.time()
    print(f"[SERVER] Loading model: {path}")
    m = YOLO(path)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    m.to(device)

    dummy = Image.new('RGB', (64, 64), color=(128, 128, 128))
    m.predict(source=dummy, conf=0.25, verbose=False)

    model        = m
    model_path   = os.path.abspath(path)
    model_name   = Path(path).name
    class_names  = list(m.names.values()) if hasattr(m, 'names') else []
    num_classes  = len(class_names)
    device_used  = device
    load_time_ms = round((time.time() - t0) * 1000)

    print(f"[SERVER] ✓ Model loaded in {load_time_ms}ms · {num_classes} classes · {device}")


def decode_image(b64_string: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(b64_string))).convert('RGB')


def run_inference(img: Image.Image, conf: float = 0.25, iou: float = 0.45) -> list:
    if model is None:
        raise RuntimeError("Model belum dimuat. Panggil /load_model terlebih dahulu.")

    results = model.predict(source=img, conf=conf, iou=iou, verbose=False)
    detections = []
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf_v = float(box.conf[0].item())
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                'class_id':   cls_id,
                'class_name': class_names[cls_id] if cls_id < len(class_names) else str(cls_id),
                'confidence': round(conf_v, 4),
                'x': round(x1, 2), 'y': round(y1, 2),
                'w': round(x2 - x1, 2), 'h': round(y2 - y1, 2),
            })
    return detections


def model_info_dict():
    return {
        'model_loaded': model is not None,
        'model_name':   model_name,
        'model_path':   model_path,
        'num_classes':  num_classes,
        'class_names':  class_names,
        'device':       device_used,
        'load_time_ms': load_time_ms,
    }


def scan_models_dir(directory: Path) -> list:
    """Return sorted list of .pt files in directory."""
    if not directory.exists():
        return []
    models = []
    for pt_file in sorted(directory.rglob('*.pt')):
        size_bytes = pt_file.stat().st_size
        models.append({
            'name':    pt_file.name,
            'path':    str(pt_file),
            'relpath': str(pt_file.relative_to(directory.parent)),
            'size_mb': round(size_bytes / 1_048_576, 1),
        })
    return models


# ──────────────────────────────────────────────────────────────
# ROUTES
# ──────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'name': 'VisionLabel Pro — YOLO Backend v2.1',
        'endpoints': ['/status', '/list_models', '/load_model', '/detect', '/detect_batch',
                      '/classes', '/validate', '/export_yaml', '/export_labels'],
        **model_info_dict(),
    })


@app.route('/status', methods=['GET'])
def status():
    return jsonify({'status': 'ok', **model_info_dict()})


@app.route('/list_models', methods=['GET'])
def api_list_models():
    """
    Scan MODELS_DIR for available .pt files.
    Optional query param: ?dir=path/to/other/folder

    Response:
        {
            "models": [
                { "name": "e2rb_pretrained.pt", "path": "models/e2rb_pretrained.pt", "size_mb": 6.2 },
                ...
            ],
            "models_dir": "models",
            "loaded_model": "e2rb_pretrained.pt"   (currently loaded, or null)
        }
    """
    scan_dir_param = request.args.get('dir', '').strip()
    scan_dir = Path(scan_dir_param) if scan_dir_param else MODELS_DIR

    models = scan_models_dir(scan_dir)
    print(f"[SERVER] /list_models → {scan_dir}: found {len(models)} model(s)")

    return jsonify({
        'models':       models,
        'models_dir':   str(scan_dir),
        'loaded_model': model_name,
        'count':        len(models),
    })


@app.route('/load_model', methods=['POST'])
def api_load_model():
    """
    Load / hot-swap a YOLO .pt file without server restart.
    Body: { "model_path": "models/e2rb_pretrained.pt" }
    """
    data = request.json or {}
    path = data.get('model_path', '').strip()
    if not path:
        return jsonify({'error': 'model_path wajib diisi'}), 400
    try:
        load_model_fn(path)
        return jsonify({'success': True, **model_info_dict()})
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/detect', methods=['POST'])
def api_detect():
    if model is None:
        return jsonify({'error': 'Model belum dimuat. Panggil /load_model terlebih dahulu.'}), 503

    data = request.json or {}
    b64  = data.get('image', '')
    if not b64:
        return jsonify({'error': 'Field "image" (base64) wajib ada'}), 400

    try:
        img = decode_image(b64)
    except Exception as e:
        return jsonify({'error': f'Gagal decode gambar: {e}'}), 400

    conf     = float(data.get('conf', 0.25))
    iou      = float(data.get('iou',  0.45))
    filename = data.get('filename', 'unknown')

    try:
        t0 = time.time()
        detections = run_inference(img, conf=conf, iou=iou)
        ms = round((time.time() - t0) * 1000)
        print(f"[SERVER] {filename}: {len(detections)} det  conf={conf}  iou={iou}  {ms}ms")
        return jsonify({
            'detections':   detections,
            'image_width':  img.width,
            'image_height': img.height,
            'count':        len(detections),
            'model_name':   model_name,
            'inference_ms': ms,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/detect_batch', methods=['POST'])
def api_detect_batch():
    if model is None:
        return jsonify({'error': 'Model belum dimuat.'}), 503

    data   = request.json or {}
    images = data.get('images', [])
    conf   = float(data.get('conf', 0.25))
    iou    = float(data.get('iou',  0.45))

    if not images:
        return jsonify({'error': 'Field "images" wajib ada (list)'}), 400

    t_start = time.time()
    results, total_dets = [], 0

    for item in images:
        filename = item.get('filename', 'unknown')
        b64      = item.get('image', '')
        entry    = {'filename': filename, 'detections': [], 'count': 0, 'error': None}
        try:
            img  = decode_image(b64)
            dets = run_inference(img, conf=conf, iou=iou)
            entry.update({'detections': dets, 'count': len(dets),
                          'image_width': img.width, 'image_height': img.height})
            total_dets += len(dets)
        except Exception as e:
            entry['error'] = str(e)
        results.append(entry)

    total_ms = round((time.time() - t_start) * 1000)
    return jsonify({'results': results, 'total_images': len(images),
                    'total_detections': total_dets, 'total_ms': total_ms, 'model_name': model_name})


@app.route('/classes', methods=['GET'])
def api_classes():
    return jsonify({'class_names': class_names, 'num_classes': num_classes, 'model_name': model_name})


@app.route('/validate', methods=['POST'])
def api_validate():
    data        = request.json or {}
    part_number = data.get('part_number', '').strip()
    detections  = data.get('detections', [])

    if not part_number:
        return jsonify({'error': 'part_number wajib diisi'}), 400

    bom = BOM_CATALOGUE.get(part_number)
    if bom is None:
        return jsonify({'error': f"Part number '{part_number}' tidak ada di katalog",
                        'available': list(BOM_CATALOGUE.keys())}), 404

    det_counts: dict = {}
    for d in detections:
        name = d.get('class_name') or ''
        if name:
            det_counts[name] = det_counts.get(name, 0) + 1

    summary, missing, extra, valid = {}, [], [], True

    for cls_name, expected in bom.items():
        detected = det_counts.get(cls_name, 0)
        ok = detected == expected
        summary[cls_name] = {'expected': expected, 'detected': detected, 'ok': ok}
        if detected < expected:
            missing.append({'class': cls_name, 'expected': expected, 'detected': detected})
            valid = False
        elif detected > expected:
            extra.append({'class': cls_name, 'detected': detected, 'expected': expected})
            valid = False

    for cls_name, count in det_counts.items():
        if cls_name not in bom:
            extra.append({'class': cls_name, 'detected': count, 'expected': 0, 'note': 'tidak ada di BOM'})
            valid = False

    return jsonify({'part_number': part_number, 'valid': valid, 'summary': summary,
                    'missing': missing, 'extra': extra,
                    'total_expected': sum(bom.values()), 'total_detected': sum(det_counts.values())})


@app.route('/bom', methods=['GET'])
def api_bom():
    part = request.args.get('part', '').strip()
    if part:
        bom = BOM_CATALOGUE.get(part)
        if bom is None:
            return jsonify({'error': f"'{part}' tidak ditemukan"}), 404
        return jsonify({'part_number': part, 'bom': bom})
    return jsonify({'catalogue': BOM_CATALOGUE, 'count': len(BOM_CATALOGUE)})


@app.route('/export_yaml', methods=['GET'])
def api_export_yaml():
    train_path = request.args.get('train', 'dataset/images/train')
    val_path   = request.args.get('val',   'dataset/images/val')
    test_path  = request.args.get('test',  '')
    fmt        = request.args.get('format', 'yaml')

    names = class_names if class_names else ALL_CLASS_NAMES
    yaml_dict = {'path': '.', 'train': train_path, 'val': val_path, 'nc': len(names), 'names': names}
    if test_path:
        yaml_dict['test'] = test_path

    if fmt == 'json':
        return jsonify(yaml_dict)

    yaml_str = yaml.dump(yaml_dict, default_flow_style=False, allow_unicode=True, sort_keys=False)
    header = (f"# VisionLabel Pro — Auto-generated dataset YAML\n"
              f"# Model: {model_name or 'N/A'}  |  Classes: {len(names)}\n\n")
    return app.response_class(response=header + yaml_str, status=200, mimetype='text/plain')


@app.route('/save_yaml', methods=['POST'])
def api_save_yaml():
    data     = request.json or {}
    out_path = data.get('path', 'dataset/dataset.yaml').strip()
    train    = data.get('train', 'dataset/images/train')
    val      = data.get('val',   'dataset/images/val')
    names    = data.get('names', class_names or ALL_CLASS_NAMES)
    nc       = data.get('nc', len(names))

    yaml_dict = {'path': '.', 'train': train, 'val': val, 'nc': nc, 'names': names}
    try:
        p = Path(out_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            f"# VisionLabel Pro — dataset.yaml\n"
            f"# Classes: {nc}  |  Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            + yaml.dump(yaml_dict, default_flow_style=False, allow_unicode=True, sort_keys=False),
            encoding='utf-8'
        )
        return jsonify({'success': True, 'path': str(p.resolve()), 'nc': nc, 'names': names})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/export_images', methods=['POST'])
def api_export_images():
    data       = request.json or {}
    output_dir = data.get('output_dir', 'dataset/images/train').strip()
    images     = data.get('images', [])
    if not images:
        return jsonify({'error': 'Field "images" wajib ada'}), 400

    out_path = Path(output_dir)
    try:
        out_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return jsonify({'error': f'Gagal buat folder: {e}'}), 500

    saved, errors = [], []
    for item in images:
        filename = Path(item.get('filename', '')).name.strip()
        b64      = item.get('image', '')
        if not filename or not b64:
            errors.append({'filename': filename, 'error': 'filename atau image kosong'})
            continue
        dest = out_path / (Path(filename).stem + '.jpg')
        try:
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
            img.save(str(dest), 'JPEG', quality=92)
            saved.append(dest.name)
        except Exception as e:
            errors.append({'filename': filename, 'error': str(e)})

    return jsonify({'output_dir': str(out_path.resolve()), 'saved': saved, 'errors': errors, 'total': len(images)})


@app.route('/export_labels', methods=['POST'])
def api_export_labels():
    data       = request.json or {}
    output_dir = data.get('output_dir', 'labels').strip()
    labels     = data.get('labels', [])
    if not labels:
        return jsonify({'error': 'Field "labels" wajib ada (list)'}), 400

    out_path = Path(output_dir)
    try:
        out_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return jsonify({'error': f'Gagal membuat folder "{output_dir}": {e}'}), 500

    saved, skipped, errors = [], [], []
    for item in labels:
        fname     = item.get('filename', '').strip()
        content   = item.get('content', '')
        overwrite = item.get('overwrite', True)
        if not fname:
            errors.append({'filename': fname, 'error': 'filename kosong'}); continue

        safe_name = Path(fname).name
        dest = out_path / safe_name
        if dest.exists() and not overwrite:
            skipped.append(safe_name); continue
        try:
            dest.write_text(content, encoding='utf-8')
            saved.append(safe_name)
        except Exception as e:
            errors.append({'filename': safe_name, 'error': str(e)})

    return jsonify({'output_dir': str(out_path.resolve()), 'saved': saved,
                    'skipped': skipped, 'errors': errors, 'total': len(labels)})


# ── TRAINING ──────────────────────────────────────────────────

train_job = {
    'running': False, 'done': False, 'epoch': 0, 'total': 100,
    'map50': 0.0, 'precision': 0.0, 'recall': 0.0, 'box_loss': 0.0,
    'weight_path': '', 'model_name': '', 'error': None, 'log': [],
}
train_thread = None


def _run_training(cfg: dict):
    global train_job
    from ultralytics import YOLO
    import torch

    train_job.update({'running': True, 'done': False, 'epoch': 0,
                      'map50': 0, 'precision': 0, 'recall': 0, 'box_loss': 0,
                      'error': None, 'log': []})

    model_name_  = cfg.get('name', 'clutch_model')
    base_weight  = cfg.get('model_path', 'yolov8s.pt')
    data_yaml    = cfg.get('data', 'dataset/dataset.yaml')
    epochs       = int(cfg.get('epochs', 100))
    batch        = int(cfg.get('batch', 16))
    imgsz        = int(cfg.get('imgsz', 640))
    lr0          = float(cfg.get('lr0', 0.001))
    patience     = int(cfg.get('patience', 20))
    project      = cfg.get('project', 'runs/detect')

    def log(msg):
        print(f'[TRAIN] {msg}')
        train_job['log'].append(msg)

    try:
        log(f'Loading base: {base_weight}')
        m = YOLO(base_weight)
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        log(f'Device: {device}')
        train_job['total'] = epochs

        def on_epoch_end(trainer):
            ep = trainer.epoch + 1
            metrics = trainer.metrics or {}
            li = trainer.loss_items
            box_loss  = float(li[0]) if li is not None and len(li) > 0 else 0
            map50     = float(metrics.get('metrics/mAP50(B)', 0))
            precision = float(metrics.get('metrics/precision(B)', 0))
            recall    = float(metrics.get('metrics/recall(B)', 0))
            train_job.update({'epoch': ep, 'map50': map50, 'precision': precision,
                               'recall': recall, 'box_loss': box_loss})
            if ep % 5 == 0 or ep <= 3:
                log(f'[EP {ep:03d}/{epochs}] mAP50={map50:.3f} P={precision:.3f} R={recall:.3f} loss={box_loss:.4f}')

        m.add_callback('on_train_epoch_end', on_epoch_end)
        log(f'Training: {model_name_}  data={data_yaml}  epochs={epochs}')
        m.train(data=data_yaml, epochs=epochs, batch=batch, imgsz=imgsz, lr0=lr0,
                patience=patience, name=model_name_, project=project, device=device, verbose=True)

        best = Path(project) / model_name_ / 'weights' / 'best.pt'
        weight_path = str(best) if best.exists() else ''
        log(f'Done! Best: {weight_path}')
        train_job.update({'running': False, 'done': True, 'weight_path': weight_path})
    except Exception as e:
        traceback.print_exc()
        train_job.update({'running': False, 'done': True, 'error': str(e)})


@app.route('/train', methods=['POST'])
def api_train():
    global train_thread, train_job
    if train_job.get('running'):
        return jsonify({'error': 'Training sedang berjalan'}), 409
    cfg = request.json or {}
    if not cfg.get('data'):
        return jsonify({'error': 'Field "data" (path dataset.yaml) wajib ada'}), 400
    import threading
    train_thread = threading.Thread(target=_run_training, args=(cfg,), daemon=True)
    train_thread.start()
    return jsonify({'success': True, 'message': f'Training dimulai: {cfg.get("name","model")}', 'config': cfg})


@app.route('/train_status', methods=['GET'])
def api_train_status():
    return jsonify({
        'running': train_job['running'], 'done': train_job['done'],
        'epoch': train_job['epoch'], 'total_epochs': train_job['total'],
        'map50': train_job['map50'], 'precision': train_job['precision'],
        'recall': train_job['recall'], 'box_loss': train_job['box_loss'],
        'weight_path': train_job['weight_path'], 'error': train_job['error'],
        'last_log': train_job['log'][-5:] if train_job['log'] else [],
        'status': 'finished' if train_job['done'] else ('running' if train_job['running'] else 'idle'),
    })


@app.route('/train_stop', methods=['POST'])
def api_train_stop():
    train_job.update({'running': False, 'done': True})
    return jsonify({'success': True, 'message': 'Stop signal sent'})


# ── ERROR HANDLERS ────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': f'Endpoint tidak ditemukan: {request.path}'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': f'Method {request.method} tidak diizinkan'}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error', 'detail': str(e)}), 500


# ──────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='VisionLabel Pro YOLO Backend v2.1')
    parser.add_argument('--model',      type=str, default='',          help='Path ke file .pt (opsional — bisa dipilih dari UI)')
    parser.add_argument('--models-dir', type=str, default='./models',  help='Folder scan model .pt (default: ./models)')
    parser.add_argument('--port',       type=int, default=5000,        help='Port server (default: 5000)')
    parser.add_argument('--host',       type=str, default='0.0.0.0',   help='Host (default: 0.0.0.0)')
    parser.add_argument('--debug',      action='store_true',            help='Flask debug mode')
    args = parser.parse_args()

    MODELS_DIR = Path(args.models_dir)

    if args.model:
        try:
            load_model_fn(args.model)
        except Exception as e:
            print(f"[SERVER] ⚠ Gagal load model: {e}")

    found_models = scan_models_dir(MODELS_DIR)

    banner = f"""
╔══════════════════════════════════════════════════════╗
║   VisionLabel Pro — YOLO Backend v2.1               ║
╠══════════════════════════════════════════════════════╣
║  Server   : http://{args.host}:{args.port:<5}                ║
║  Model    : {(model_name or '(belum dimuat — pilih dari UI)'):<41}║
║  Models/  : {str(MODELS_DIR):<41}║
║  Scanned  : {len(found_models):<3} file .pt ditemukan                   ║
╠══════════════════════════════════════════════════════╣
║  GET  /list_models   ← daftar model tersedia        ║
║  POST /load_model    ← hot-swap tanpa restart       ║
║  POST /detect        ← inferensi 1 gambar           ║
║  POST /detect_batch  ← inferensi batch              ║
║  POST /train         ← mulai training background    ║
║  GET  /train_status  ← poll progress                ║
╚══════════════════════════════════════════════════════╝
"""
    print(banner)
    if found_models:
        print(f"[SERVER] Model tersedia di '{MODELS_DIR}':")
        for m in found_models:
            active = " ← aktif" if m['name'] == model_name else ""
            print(f"         • {m['name']} ({m['size_mb']} MB){active}")
        print()

    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)