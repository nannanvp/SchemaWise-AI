"""Local integration checks; provider responses are mocked, never billed."""
import os
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import AsyncMock, patch

_temp = tempfile.TemporaryDirectory()
os.environ['SCHEMAWISE_DB'] = str(Path(_temp.name) / 'test.db')
from backend.main import app
from fastapi.testclient import TestClient


class QuestionModes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_app_bank_images_and_panels(self):
        self.assertEqual(self.client.get('/api/health').status_code, 200)
        html = self.client.get('/').text
        for panel in ['learn', 'download', 'help']:
            self.assertIn(f'id="tab-{panel}"', html)
        self.assertIn('id="quizSource"', html)
        data = self.client.get('/api/exam/questions?limit=100').json()
        self.assertEqual(data['count'], 96)
        counts = Counter(q['topic'] for q in data['questions'])
        self.assertEqual(sorted(counts.values()), [16, 20, 20, 20, 20])
        for topic in counts:
            q = next(q for q in data['questions'] if q['topic'] == topic)
            for image in q['images']:
                self.assertEqual(self.client.get(image).status_code, 200)
            self.assertEqual(self.client.get(q['source_url'].split('#')[0]).status_code, 200)
        quiz = self.client.post('/api/quiz/generate', json={'count': 1}).json()
        self.assertEqual(quiz['source'], 'gate-pyq')
        self.assertEqual(len(quiz['questions']), 1)
        self.assertEqual(self.client.post('/api/exam/generate', json={}).status_code, 410)

    def test_ai_validation_and_label(self):
        sample = dict(question='Which constraint identifies each row?',
                      options=['Primary key', 'Default', 'Check', 'Null'],
                      answer=0, explanation='A primary key uniquely identifies a row.')
        invalid = dict(sample, answer=9)
        with patch('ai_quiz.ai_generate_json', new=AsyncMock(return_value={
            'questions': [invalid, sample, sample]})):
            response = self.client.post('/api/quiz/generate', json={'source': 'ai', 'count': 3})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['source'], 'ai')
        self.assertEqual(data['count'], 1)
        q = data['questions'][0]
        self.assertEqual(q['answers'], [0])
        self.assertEqual(q['tag'], 'AI-generated practice')
        self.assertNotIn('source_url', q)
        self.assertNotIn('year', q)
        self.assertTrue(q['explanation'])

    def test_ai_failure_does_not_fabricate_fallback(self):
        with patch('ai_quiz.ai_generate_json', new=AsyncMock(return_value=None)):
            response = self.client.post('/api/quiz/generate', json={'source': 'ai'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('Official GATE PYQs remain available', response.json()['detail'])

    def test_unknown_source_rejected(self):
        self.assertEqual(self.client.post('/api/quiz/generate', json={'source': 'invented'}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
