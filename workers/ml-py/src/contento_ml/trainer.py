from __future__ import annotations

import os
from pathlib import Path


def train_lora(image_dir: Path, output_dir: Path) -> Path:
    """Run LoRA fine-tune.

    Two modes:
      * LORA_MOCK_TRAINING=true — writes a placeholder file so the rest of the
        pipeline can be exercised without a GPU. Returns immediately.
      * Otherwise — raises NotImplementedError. Real LoRA fine-tuning is not yet
        implemented; the old "save initial UNet weights" path silently produced
        a non-trained checkpoint and is removed to stop misleading downstream
        consumers. To wire this up properly, add a training loop here (dataset,
        optimizer, accelerate, validation) and remove the guard.
    """
    mock = os.getenv('LORA_MOCK_TRAINING', '').lower() in ('1', 'true', 'yes')

    if mock:
        return _mock_train(image_dir, output_dir)

    raise NotImplementedError(
        'Real LoRA training is not implemented yet. '
        'Set LORA_MOCK_TRAINING=true to use the placeholder pipeline, '
        'or implement the training loop in workers/ml-py/src/contento_ml/trainer.py.'
    )


def _mock_train(image_dir: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    weights_path = output_dir / 'lora_weights.pt'
    weights_path.write_bytes(b'MOCK_LORA_WEIGHTS')
    print(f'[ml] Mock training complete ({image_dir}), wrote placeholder to {weights_path}')
    return weights_path
