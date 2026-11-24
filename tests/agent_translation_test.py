import importlib.util
from pathlib import Path
import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('agent_translate', Path(__file__).parents[1] / 'scripts/agent-translate.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TranslationTests(unittest.TestCase):
    def test_language_image_ids_are_not_translation_tasks(self):
        content = {'title': {'ko': '제목', 'en': 'Title', 'th': 'ชื่อเรื่อง'}, 'blocks': [
            {'type': 'image', 'asset': 'original', 'images': {'th': {'asset': 'thai-image-id'}, 'en': {'asset': 'english-image-id'}}}]}
        tasks, _, _ = m.plan(content)
        self.assertEqual(tasks, [])

    def test_only_missing_prose_not_urls_hidden_or_assets(self):
        c = {'title': {'ko': '제목', 'th': 'ชื่อ'}, 'cover': 'asset-id', 'blocks': [
            {'type': 'video', 'url': {'ko': 'https://example.test'}},
            {'type': 'text', 'hidden': True, 'text': {'ko': '숨김'}},
            {'type': 'text', 'text': {'en': 'Hello'}}]}
        tasks, _, _ = m.plan(c)
        self.assertEqual([(t['path'], t['lang']) for t in tasks], [(['title'], 'en'), (['blocks', 2, 'text'], 'ko'), (['blocks', 2, 'text'], 'th')])
        out, _ = m.apply_text(c, tasks, [{'path': t['path'], 'lang': t['lang'], 'text': '번역'} for t in tasks])
        self.assertEqual(out['title']['th'], 'ชื่อ')
        self.assertEqual(out['blocks'][:2], c['blocks'][:2])
        self.assertEqual(c['title'], {'ko': '제목', 'th': 'ชื่อ'})

    def test_generated_fields_refresh_human_edits_preserved(self):
        old = {'title': {'ko': '옛 제목', 'en': 'Old', 'th': 'เก่า'}}
        pk = m.pathkey(['title'])
        prev = {'content': old, 'generated': {pk: {'en': 'Old', 'th': 'เก่า'}}}
        now = {'title': {'ko': '새 제목', 'en': 'Old', 'th': 'คนแก้ไข'}}
        tasks, reviews, retained = m.plan(now, prev)
        self.assertEqual([t['lang'] for t in tasks], ['en'])
        self.assertEqual(retained[pk], {'en': 'Old'})
        self.assertEqual(reviews, [])

    def test_stale_manual_translation_remains_reviewable(self):
        old = {'title': {'ko': '옛', 'en': 'Human', 'th': 'มนุษย์'}}
        now = {'title': {'ko': '새', 'en': 'Human', 'th': 'มนุษย์'}}
        tasks, reviews, generated = m.plan(now, {'content': old})
        self.assertFalse(tasks)
        self.assertEqual(len(reviews), 2)
        _, again, _ = m.plan(now, {'content': now, 'reviews': reviews, 'generated': generated})
        self.assertEqual(reviews, again)
        now2 = {'title': {**now['title'], 'en': 'Human corrected'}}
        _, remaining, _ = m.plan(now2, {'content': now, 'reviews': reviews})
        self.assertEqual([r['lang'] for r in remaining], ['th'])

    def test_source_stays_thai_after_generating_korean(self):
        c = {'title': {'th': 'ต้นฉบับ'}}
        tasks, _, _ = m.plan(c)
        out, gen = m.apply_text(c, tasks, [{'path': t['path'], 'lang': t['lang'], 'text': 'translated'} for t in tasks])
        changed = {'title': {**out['title'], 'th': 'ต้นฉบับใหม่'}}
        todo, _, _ = m.plan(changed, {'content': out, 'generated': gen})
        self.assertEqual({t['source_lang'] for t in todo}, {'th'})
        self.assertEqual({t['lang'] for t in todo}, {'ko', 'en'})

    def test_unrequested_fields_duplicates_or_missing_rejected(self):
        c = {'title': {'ko': '제목'}}
        tasks, _, _ = m.plan(c)
        with self.assertRaises(ValueError):
            m.apply_text(c, tasks, [])
        with self.assertRaises(ValueError):
            m.apply_text(c, tasks, [{'path': ['title'], 'lang': 'ko', 'text': 'overwrite'}] * 2)
        with self.assertRaises(ValueError):
            m.apply_text(c, tasks, [{'path': ['title'], 'lang': 'en', 'text': 'duplicate'}] * 2)

    def test_wrong_school_is_rejected_before_content_access(self):
        with self.assertRaises(ValueError):
            m.identity({'school': 'Other', 'perms': ['read', 'edit']}, 'Expected')
        with self.assertRaises(ValueError):
            m.identity({'school': 'Expected', 'perms': ['read']}, 'Expected')

    def test_save_verifies_new_version_and_records_auto_provenance(self):
        content = {'title': {'ko': '원문'}, 'blocks': []}
        tasks, _, _ = m.plan(content)
        texts = [{'path': t['path'], 'lang': t['lang'], 'text': 'translation'} for t in tasks]
        expected, _ = m.apply_text(content, tasks, texts)
        proposal = {'school': 'Expected', 'entries': [{'kind': 'story', 'key': 'one', 'base_version': 1, 'translations': texts}]}
        with tempfile.TemporaryDirectory() as folder:
            args = SimpleNamespace(input=Path(folder) / 'proposal.json', state=Path(folder) / 'state.json', school='Expected')
            m.save(args.input, proposal)
            state = {'school': 'Expected', 'entries': {}}
            responses = [{'latest': {'version': 1, 'content': content}}, {'version': 2, 'published': False}, {'latest': {'version': 2, 'content': expected}}]
            with patch.object(m, 'api', side_effect=responses) as api:
                result = m.apply(args, state, {'kinds': ['story']})
                self.assertEqual(result['saved'][0]['version'], 2)
                self.assertEqual(api.call_args_list[1].args[1], '/api/agent/entries/story/one/versions')
                self.assertEqual(api.call_args_list[1].args[2]['base_version'], 1)
            saved = m.read(args.state)['entries']['story/one']
            self.assertEqual(saved['content'], expected)
            self.assertEqual(m.plan(expected, saved)[0], [])
            self.assertEqual(saved['generated'][m.pathkey(['title'])], {'th': 'translation', 'en': 'translation'})

    def test_concurrent_save_rejected_before_post(self):
        args = SimpleNamespace(input=Path('unused'), school='Expected')
        proposal = {'school': 'Expected', 'entries': [{'kind': 'story', 'key': 'one', 'base_version': 1}]}
        with patch.object(m, 'read', return_value=proposal), patch.object(m, 'api', return_value={'latest': {'version': 2}}) as api:
            with self.assertRaises(ValueError):
                m.apply(args, {'entries': {}}, {'kinds': ['story']})
            self.assertEqual([call.args[0] for call in api.call_args_list], ['GET'])


if __name__ == '__main__':
    unittest.main()
