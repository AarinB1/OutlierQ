from setuptools import setup, find_packages

setup(
    name="outlierq",
    version="0.1.0",
    description="Event-driven options trading signal generator",
    author="OutlierQ",
    python_requires=">=3.11",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "finnhub-python>=2.4.18",
        "yfinance>=0.2.36",
        "praw>=7.7.1",
        "requests>=2.31.0",
        "python-dotenv>=1.0.1",
        "sqlalchemy>=2.0.25",
        "pydantic>=2.5.3",
        "apscheduler>=3.10.4",
        "vaderSentiment>=3.3.2",
        "transformers>=4.37.0",
        "torch>=2.1.0",
        "pandas>=2.1.5",
    ],
    extras_require={
        "dev": ["pytest>=7.4.4"],
    },
)
