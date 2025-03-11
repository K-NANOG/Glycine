import React from 'react';
import {
    Card,
    CardContent,
    Typography,
    Chip,
    Box,
    Link,
    Tooltip,
    IconButton,
    Stack,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PersonIcon from '@mui/icons-material/Person';
import ArticleIcon from '@mui/icons-material/Article';

interface Paper {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    pmid?: string;
    url: string;
    publicationDate?: Date;
    journal?: string;
    keywords?: string[];
    categories?: string[];
}

const StyledCard = styled(Card)(({ theme }) => ({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[4],
    },
}));

const TruncatedTypography = styled(Typography)({
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
});

const PaperCard: React.FC<{ paper: Paper }> = ({ paper }) => {
    return (
        <StyledCard>
            <CardContent>
                <Box sx={{ mb: 2 }}>
                    <Link
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            color: 'primary.main',
                            fontWeight: 'medium',
                            mb: 1,
                        }}
                    >
                        <Typography variant="h6" component="h2">
                            {paper.title}
                        </Typography>
                        <OpenInNewIcon sx={{ ml: 1, fontSize: 'small' }} />
                    </Link>

                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        {paper.journal && (
                            <Tooltip title="Journal">
                                <Chip
                                    icon={<ArticleIcon />}
                                    label={paper.journal}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                />
                            </Tooltip>
                        )}
                        {paper.publicationDate && (
                            <Tooltip title="Publication Date">
                                <Chip
                                    icon={<CalendarTodayIcon />}
                                    label={new Date(paper.publicationDate).toLocaleDateString()}
                                    size="small"
                                    variant="outlined"
                                />
                            </Tooltip>
                        )}
                    </Stack>
                </Box>

                <TruncatedTypography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {paper.abstract}
                </TruncatedTypography>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <PersonIcon sx={{ mr: 1, fontSize: 'small' }} />
                        Authors:
                    </Typography>
                    <Typography variant="body2">
                        {paper.authors.join(', ')}
                    </Typography>
                </Box>

                {(paper.keywords?.length > 0 || paper.categories?.length > 0) && (
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <LocalOfferIcon sx={{ mr: 1, fontSize: 'small' }} />
                            Keywords & Categories:
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {paper.keywords?.map((keyword, index) => (
                                <Chip
                                    key={`keyword-${index}`}
                                    label={keyword}
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                />
                            ))}
                            {paper.categories?.map((category, index) => (
                                <Chip
                                    key={`category-${index}`}
                                    label={category}
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                />
                            ))}
                        </Stack>
                    </Box>
                )}

                <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Stack direction="row" spacing={2} justifyContent="flex-start">
                        {paper.doi && (
                            <Tooltip title="DOI">
                                <Link
                                    href={`https://doi.org/${paper.doi}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    color="text.secondary"
                                    underline="hover"
                                >
                                    DOI: {paper.doi}
                                </Link>
                            </Tooltip>
                        )}
                        {paper.pmid && (
                            <Tooltip title="PubMed ID">
                                <Link
                                    href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    color="text.secondary"
                                    underline="hover"
                                >
                                    PMID: {paper.pmid}
                                </Link>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>
            </CardContent>
        </StyledCard>
    );
};

export default PaperCard; 