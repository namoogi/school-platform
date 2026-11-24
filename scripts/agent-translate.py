#!/usr/bin/env python3
"""Subscription agent transport: scan missing translations, then apply agent-written text.
No model API calls. SCHOOL_AGENT_TOKEN is used only in the school API header.
"""
import argparse
import copy
import fcntl
import http.client
import json
import os
from pathlib import Path
from urllib.parse import quote

LANGS = ('ko', 'th', 'en')
HOST = 'onschools.vercel.app'


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.replace(path)


def api(method, path, body=None):
    conn = http.client.HTTPSConnection(HOST, timeout=40)
    try:
        headers = {'x-agent-token': os.environ['SCHOOL_AGENT_TOKEN'], 'Content-Type': 'application/json'}
        conn.request(method, path, None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers)
        response = conn.getresponse()
        raw = response.read()
        if response.status not in range(200, 300):
            raise RuntimeError(f'School API HTTP {response.status}; no response body logged')
        return json.loads(raw)
    finally:
        conn.close()


def fields(value, path=()):
    if isinstance(value, list):
        for i, child in enumerate(value):
            yield from fields(child, path + (i,))
    elif isinstance(value, dict):
        if value.get('hidden') is True:
            return
        if value and set(value) <= set(LANGS) and all(isinstance(v, str) for v in value.values()):
            if any(v.strip() for v in value.values()):
                yield path, value
            return
        for k, child in value.items():
            if k != 'url':  # video URL has the same JSON shape but is not prose
                yield from fields(child, path + (k,))


def pathkey(path):
    return json.dumps(path, ensure_ascii=False, separators=(',', ':'))


def plan(content, previous=None):
    previous = previous or {}
    old_fields = {pathkey(p): f for p, f in fields(previous.get('content', {}))}
    generated = previous.get('generated', {})
    prior_reviews = {(r['path_key'], r['lang']) for r in previous.get('reviews', [])}
    tasks, reviews, retained = [], [], {}
    for path, field in fields(content):
        pk = pathkey(path)
        old = old_fields.get(pk, {})
        auto = generated.get(pk, {})
        # A changed translation is human-owned from now on.
        auto = {lang: text for lang, text in auto.items() if field.get(lang) == text}
        # Never use an auto-generated target as the new source language.
        source = next((lang for lang in LANGS if field.get(lang, '').strip() and lang not in auto), None)
        if source is None:
            continue
        source_changed = bool(old.get(source)) and old[source] != field[source]
        retained[pk] = auto
        for lang in LANGS:
            if lang == source:
                continue
            missing = not field.get(lang, '').strip()
            if missing or (source_changed and lang in auto):
                tasks.append({'path': list(path), 'source_lang': source, 'source': field[source], 'lang': lang})
            elif (source_changed or (pk, lang) in prior_reviews) and field.get(lang) == old.get(lang) and lang not in auto:
                reviews.append({'path_key': pk, 'lang': lang, 'reason': 'source_changed_manual_translation_preserved'})
    return tasks, reviews, retained


def apply_text(content, tasks, translations):
    allowed = {(pathkey(t['path']), t['lang']): t for t in tasks}
    if not isinstance(translations, list) or len(translations) != len(allowed):
        raise ValueError('Supply every requested translation exactly once')
    result = copy.deepcopy(content)
    seen, generated = set(), {}
    for t in translations:
        key = (pathkey(t['path']), t['lang'])
        if key not in allowed or key in seen:
            raise ValueError('Unknown or duplicate translation field')
        if not isinstance(t['text'], str) or not t['text'].strip() or len(t['text']) > 5000:
            raise ValueError('Translation must be nonempty text, at most 5000 characters')
        seen.add(key)
        target = result
        for part in allowed[key]['path']:
            target = target[part]
        target[t['lang']] = t['text']
        generated.setdefault(key[0], {})[key[1]] = t['text']
    return result, generated


def identity(me, school):
    if me.get('school') != school:
        raise ValueError('Unexpected school; refusing to read or write content')
    if not {'read', 'edit'} <= set(me.get('perms', [])):
        raise ValueError('Token needs read and edit permissions')


def entry_path(kind, key):
    if kind not in ('story', 'page', 'news'):
        raise ValueError('Unsupported content kind')
    return '/api/agent/entries/' + kind + '/' + quote(key, safe='')


def scan(args, state, me):
    bundle, counts = [], {'checked': 0, 'pending_entries': 0, 'translation_fields': 0, 'manual_review_fields': 0}
    for kind in me['kinds']:
        for row in api('GET', '/api/agent/entries/' + kind):
            if row.get('archived_at'):
                continue
            key = kind + '/' + row['key']
            prev = state['entries'].get(key)
            if prev and prev['version'] == row['latest_version']:
                current = {'latest': {'version': prev['version'], 'content': prev['content']}}
            else:
                current = api('GET', entry_path(kind, row['key']))
            latest = current['latest']
            tasks, reviews, generated = plan(latest['content'], prev)
            counts['checked'] += 1
            counts['manual_review_fields'] += len(reviews)
            if tasks:
                counts['pending_entries'] += 1
                counts['translation_fields'] += len(tasks)
                bundle.append({'kind': kind, 'key': row['key'], 'base_version': latest['version'],
                               'content': latest['content'], 'tasks': tasks, 'reviews': reviews})
            else:
                state['entries'][key] = {'version': latest['version'], 'content': latest['content'],
                                         'generated': generated, 'reviews': reviews}
    save(args.state, state)
    save(args.bundle, {'school': args.school, 'entries': bundle, 'counts': counts})
    return {**counts, 'publish_permitted': 'publish' in me['perms'], 'expires_at': me.get('expires_at')}


def apply(args, state, me):
    proposal = read(args.input)
    if not proposal or proposal.get('school') != args.school:
        raise ValueError('Translation proposal belongs to another school')
    receipts = []
    for item in proposal['entries']:
        if item['kind'] not in me['kinds']:
            raise ValueError('Content kind outside token scope')
        path = entry_path(item['kind'], item['key'])
        current = api('GET', path)
        if current['latest']['version'] != item['base_version']:
            raise ValueError('Newer version found; scan again and translate against the latest content')
        key = item['kind'] + '/' + item['key']
        tasks, reviews, generated = plan(current['latest']['content'], state['entries'].get(key))
        if not tasks:
            raise ValueError('No translation needed; refusing to create a redundant version')
        content, additions = apply_text(current['latest']['content'], tasks, item['translations'])
        receipt = api('POST', path + '/versions', {'content': content, 'base_version': item['base_version'],
                      'note': 'Codex 구독 번역 · 한국어/ไทย/English · 기존 글·그림 보존'})
        verified = api('GET', path)
        # If another writer advanced the version, do not mark its work as our translation.
        if verified['latest']['version'] != receipt['version'] or verified['latest']['content'] != content:
            raise RuntimeError('Saved version needs reconciliation; scan the latest version before continuing')
        for pk, values in additions.items():
            generated.setdefault(pk, {}).update(values)
        state['entries'][key] = {'version': receipt['version'], 'content': content, 'generated': generated, 'reviews': reviews}
        save(args.state, state)  # durable after each entry, including partial runs
        receipts.append({'kind': item['kind'], 'key': item['key'], 'version': receipt['version'], 'published': False})
    return {'saved': receipts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['scan', 'apply'])
    parser.add_argument('--school', required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--input', type=Path)
    args = parser.parse_args()
    if not os.environ.get('SCHOOL_AGENT_TOKEN'):
        raise ValueError('SCHOOL_AGENT_TOKEN is required')
    if args.command == 'scan' and args.bundle is None:
        parser.error('scan needs --bundle')
    if args.command == 'apply' and args.input is None:
        parser.error('apply needs --input')
    args.state.parent.mkdir(parents=True, exist_ok=True)
    with args.state.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = read(args.state, {'school': args.school, 'entries': {}})
        if state.get('school') != args.school:
            raise ValueError('State belongs to another school')
        me = api('GET', '/api/agent/me')
        identity(me, args.school)
        result = scan(args, state, me) if args.command == 'scan' else apply(args, state, me)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print provider response bodies, credentials, or a full traceback.
        safe = str(error).replace(os.environ.get('SCHOOL_AGENT_TOKEN', '\0'), '[REDACTED]')
        print(json.dumps({'error': safe}, ensure_ascii=False))
        raise SystemExit(1)
